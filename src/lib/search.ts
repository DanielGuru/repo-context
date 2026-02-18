import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import type { ContextStore, ContextEntry } from "./context-store.js";

export interface SearchResult {
  category: string;
  filename: string;
  title: string;
  snippet: string;
  score: number;
  relativePath: string;
}

// sql.js types (loaded dynamically)
interface SqlJsDatabase {
  run(sql: string, params?: unknown[]): SqlJsDatabase;
  exec(sql: string, params?: unknown[]): Array<{ columns: string[]; values: unknown[][] }>;
  export(): Uint8Array;
  close(): void;
}

interface SqlJsStatic {
  Database: new (data?: ArrayLike<number>) => SqlJsDatabase;
}

let initSqlJsPromise: Promise<SqlJsStatic> | null = null;

async function getSqlJs(): Promise<SqlJsStatic> {
  if (!initSqlJsPromise) {
    initSqlJsPromise = import("sql.js").then((mod) => {
      const initSqlJs = mod.default;
      return initSqlJs();
    });
  }
  return initSqlJsPromise;
}

export class SearchIndex {
  private db: SqlJsDatabase | null = null;
  private dbPath: string;
  private store: ContextStore;
  private initialized = false;

  constructor(contextDir: string, store: ContextStore) {
    this.dbPath = join(contextDir, ".search.db");
    this.store = store;
  }

  private async ensureDb(): Promise<SqlJsDatabase> {
    if (this.db) return this.db;

    const SQL = await getSqlJs();

    if (existsSync(this.dbPath)) {
      try {
        const buffer = readFileSync(this.dbPath);
        this.db = new SQL.Database(buffer);
      } catch {
        this.db = new SQL.Database();
      }
    } else {
      this.db = new SQL.Database();
    }

    if (!this.initialized) {
      this.initSchema();
      this.initialized = true;
    }

    return this.db;
  }

  private initSchema(): void {
    if (!this.db) return;

    this.db.run(`
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        filename TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(category, filename)
      )
    `);

    this.db.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
        title,
        content,
        category,
        content=documents,
        content_rowid=id,
        tokenize='porter unicode61'
      )
    `);

    this.db.run(`
      CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
        INSERT INTO documents_fts(rowid, title, content, category)
        VALUES (new.id, new.title, new.content, new.category);
      END
    `);

    this.db.run(`
      CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
        INSERT INTO documents_fts(documents_fts, rowid, title, content, category)
        VALUES ('delete', old.id, old.title, old.content, old.category);
      END
    `);

    this.db.run(`
      CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
        INSERT INTO documents_fts(documents_fts, rowid, title, content, category)
        VALUES ('delete', old.id, old.title, old.content, old.category);
        INSERT INTO documents_fts(rowid, title, content, category)
        VALUES (new.id, new.title, new.content, new.category);
      END
    `);
  }

  async rebuild(): Promise<void> {
    const db = await this.ensureDb();

    db.run("DELETE FROM documents");

    const entries = this.store.listEntries();
    for (const entry of entries) {
      db.run(
        `INSERT OR REPLACE INTO documents (category, filename, title, content, relative_path, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          entry.category,
          entry.filename,
          entry.title,
          entry.content,
          entry.relativePath,
          entry.lastModified.toISOString(),
        ]
      );
    }

    this.save();
  }

  async indexEntry(entry: ContextEntry): Promise<void> {
    const db = await this.ensureDb();

    // Upsert: delete then insert to trigger FTS sync
    db.run(
      "DELETE FROM documents WHERE category = ? AND filename = ?",
      [entry.category, entry.filename]
    );

    db.run(
      `INSERT INTO documents (category, filename, title, content, relative_path, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        entry.category,
        entry.filename,
        entry.title,
        entry.content,
        entry.relativePath,
        entry.lastModified.toISOString(),
      ]
    );

    this.save();
  }

  async removeEntry(category: string, filename: string): Promise<void> {
    const db = await this.ensureDb();
    db.run(
      "DELETE FROM documents WHERE category = ? AND filename = ?",
      [category, filename]
    );
    this.save();
  }

  async search(query: string, category?: string, limit: number = 10): Promise<SearchResult[]> {
    const db = await this.ensureDb();

    // Build FTS5 query: use AND semantics (implicit AND in FTS5)
    const terms = query
      .replace(/['"]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .map((term) => `"${term}"`)
      .join(" ");

    if (!terms) return [];

    let sql = `
      SELECT
        d.category,
        d.filename,
        d.title,
        d.content,
        d.relative_path,
        rank * -1 as score
      FROM documents_fts
      JOIN documents d ON d.id = documents_fts.rowid
      WHERE documents_fts MATCH ?
    `;

    const params: unknown[] = [terms];

    if (category) {
      sql += " AND d.category = ?";
      params.push(category);
    }

    sql += " ORDER BY rank LIMIT ?";
    params.push(limit);

    try {
      const results = db.exec(sql, params);
      if (!results.length || !results[0].values.length) {
        // Fallback: try OR semantics if AND returned nothing
        const orTerms = query
          .replace(/['"]/g, "")
          .split(/\s+/)
          .filter(Boolean)
          .map((term) => `"${term}"`)
          .join(" OR ");

        if (orTerms !== terms) {
          params[0] = orTerms;
          const orResults = db.exec(sql, params);
          if (orResults.length && orResults[0].values.length) {
            return this.mapResults(orResults[0], query);
          }
        }
        return [];
      }

      return this.mapResults(results[0], query);
    } catch {
      return [];
    }
  }

  private mapResults(
    result: { columns: string[]; values: unknown[][] },
    query: string
  ): SearchResult[] {
    return result.values.map((row) => ({
      category: row[0] as string,
      filename: row[1] as string,
      title: row[2] as string,
      snippet: this.extractSnippet(row[3] as string, query),
      score: row[5] as number,
      relativePath: row[4] as string,
    }));
  }

  private extractSnippet(content: string, query: string, maxLength: number = 500): string {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const lines = content.split("\n");

    const matchingLines: { line: string; index: number; matchCount: number }[] = [];

    for (let i = 0; i < lines.length; i++) {
      const lower = lines[i].toLowerCase();
      const matchCount = terms.filter((t) => lower.includes(t)).length;
      if (matchCount > 0) {
        matchingLines.push({ line: lines[i], index: i, matchCount });
      }
    }

    if (matchingLines.length === 0) {
      return content.slice(0, maxLength);
    }

    matchingLines.sort((a, b) => b.matchCount - a.matchCount);
    const bestMatch = matchingLines[0];
    const start = Math.max(0, bestMatch.index - 2);
    const end = Math.min(lines.length, bestMatch.index + 5);

    return lines.slice(start, end).join("\n").slice(0, maxLength);
  }

  private save(): void {
    if (!this.db) return;
    try {
      const data = this.db.export();
      writeFileSync(this.dbPath, Buffer.from(data));
    } catch {
      // Silently fail — search degradation is acceptable
    }
  }

  close(): void {
    if (this.db) {
      this.save();
      this.db.close();
      this.db = null;
    }
    this.initialized = false;
  }
}
