import Database from "better-sqlite3";
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

export class SearchIndex {
  private db: Database.Database;
  private store: ContextStore;

  constructor(contextDir: string, store: ContextStore) {
    const dbPath = join(contextDir, ".search.db");
    this.db = new Database(dbPath);
    this.store = store;
    this.init();
  }

  private init(): void {
    this.db.pragma("journal_mode = WAL");

    this.db.exec(`
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

    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
        title,
        content,
        category,
        content=documents,
        content_rowid=id,
        tokenize='porter unicode61'
      )
    `);

    // Triggers to keep FTS in sync
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
        INSERT INTO documents_fts(rowid, title, content, category)
        VALUES (new.id, new.title, new.content, new.category);
      END
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
        INSERT INTO documents_fts(documents_fts, rowid, title, content, category)
        VALUES ('delete', old.id, old.title, old.content, old.category);
      END
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
        INSERT INTO documents_fts(documents_fts, rowid, title, content, category)
        VALUES ('delete', old.id, old.title, old.content, old.category);
        INSERT INTO documents_fts(rowid, title, content, category)
        VALUES (new.id, new.title, new.content, new.category);
      END
    `);
  }

  rebuild(): void {
    // Clear existing data
    this.db.exec("DELETE FROM documents");

    const entries = this.store.listEntries();
    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO documents (category, filename, title, content, relative_path, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const tx = this.db.transaction((entries: ContextEntry[]) => {
      for (const entry of entries) {
        insert.run(
          entry.category,
          entry.filename,
          entry.title,
          entry.content,
          entry.relativePath,
          entry.lastModified.toISOString()
        );
      }
    });

    tx(entries);
  }

  indexEntry(entry: ContextEntry): void {
    this.db
      .prepare(
        `
      INSERT OR REPLACE INTO documents (category, filename, title, content, relative_path, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        entry.category,
        entry.filename,
        entry.title,
        entry.content,
        entry.relativePath,
        entry.lastModified.toISOString()
      );
  }

  search(query: string, category?: string, limit: number = 10): SearchResult[] {
    // Escape special FTS5 characters
    const escapedQuery = query
      .replace(/['"]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .map((term) => `"${term}"`)
      .join(" OR ");

    if (!escapedQuery) return [];

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

    const params: (string | number)[] = [escapedQuery];

    if (category) {
      sql += " AND d.category = ?";
      params.push(category);
    }

    sql += " ORDER BY rank LIMIT ?";
    params.push(limit);

    const rows = this.db.prepare(sql).all(...params) as Array<{
      category: string;
      filename: string;
      title: string;
      content: string;
      relative_path: string;
      score: number;
    }>;

    return rows.map((row) => ({
      category: row.category,
      filename: row.filename,
      title: row.title,
      snippet: this.extractSnippet(row.content, query),
      score: row.score,
      relativePath: row.relative_path,
    }));
  }

  private extractSnippet(content: string, query: string, maxLength: number = 500): string {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const lines = content.split("\n");

    // Find lines containing query terms
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

    // Sort by match count, take best matches
    matchingLines.sort((a, b) => b.matchCount - a.matchCount);

    // Build snippet from best matching region
    const bestMatch = matchingLines[0];
    const start = Math.max(0, bestMatch.index - 2);
    const end = Math.min(lines.length, bestMatch.index + 5);

    return lines.slice(start, end).join("\n").slice(0, maxLength);
  }

  close(): void {
    this.db.close();
  }
}
