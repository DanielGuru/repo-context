import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import type { ContextStore, ContextEntry } from "./context-store.js";
import type { EmbeddingProvider } from "./embeddings.js";
import { cosineSimilarity } from "./embeddings.js";

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
    }).catch((err) => {
      initSqlJsPromise = null; // Allow retry on failure
      throw err;
    });
  }
  return initSqlJsPromise;
}

interface CachedEmbedding {
  category: string;
  filename: string;
  title: string;
  content: string;
  relativePath: string;
  embedding: Float32Array;
}

export class SearchIndex {
  private db: SqlJsDatabase | null = null;
  private initPromise: Promise<SqlJsDatabase> | null = null;
  private dirty = false;
  private dbPath: string;
  private store: ContextStore;
  private hasFts5 = false;
  private embeddingProvider: EmbeddingProvider | null;
  private alpha: number;

  // In-memory embedding cache — avoids re-fetching from SQLite on every semantic query.
  // Invalidated whenever an entry is added, updated, or removed.
  private embeddingCache: CachedEmbedding[] | null = null;
  private embeddingCacheDirty = true;

  constructor(
    contextDir: string,
    store: ContextStore,
    embeddingProvider?: EmbeddingProvider | null,
    alpha?: number
  ) {
    this.dbPath = join(contextDir, ".search.db");
    this.store = store;
    this.embeddingProvider = embeddingProvider ?? null;
    this.alpha = alpha ?? 0.5;
  }

  private async ensureDb(): Promise<SqlJsDatabase> {
    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._initDb();
    return this.initPromise;
  }

  private async _initDb(): Promise<SqlJsDatabase> {
    const SQL = await getSqlJs();

    // Try to load existing DB from disk
    if (existsSync(this.dbPath)) {
      try {
        const data = readFileSync(this.dbPath);
        this.db = new SQL.Database(data);

        // Detect FTS5 availability
        try {
          this.db.exec("SELECT * FROM documents_fts LIMIT 0");
          this.hasFts5 = true;
        } catch {
          this.hasFts5 = false;
        }

        // Ensure embedding columns exist (migration for v1.0 → v1.1)
        try {
          this.db.exec("SELECT embedding FROM documents LIMIT 0");
        } catch {
          // Columns don't exist yet, add them
          try {
            this.db.run("ALTER TABLE documents ADD COLUMN embedding BLOB");
            this.db.run("ALTER TABLE documents ADD COLUMN embedding_dims INTEGER DEFAULT 0");
          } catch {
            // If ALTER fails, we'll rebuild from scratch
            this.db.close();
            this.db = new SQL.Database();
            this.initSchema();
            // FTS5 state was set from old DB — re-detect after fresh init
            try {
              this.db.exec("SELECT * FROM documents_fts LIMIT 0");
              this.hasFts5 = true;
            } catch {
              this.hasFts5 = false;
            }
          }
        }

        return this.db;
      } catch {
        // Corrupt DB, start fresh
      }
    }

    this.db = new SQL.Database();
    this.initSchema();
    return this.db;
  }

  private initSchema(): void {
    if (!this.db) return;

    // Core documents table — always created
    this.db.run(`
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        filename TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        embedding BLOB,
        embedding_dims INTEGER DEFAULT 0,
        UNIQUE(category, filename)
      )
    `);

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_docs_category ON documents(category)`);

    // Try FTS5 — it's fast for large repos but not always available in sql.js
    try {
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

      this.hasFts5 = true;
    } catch {
      // FTS5 not available in this sql.js build — fall back to LIKE queries
      this.hasFts5 = false;
    }
  }

  async rebuild(): Promise<void> {
    const db = await this.ensureDb();

    const entries = this.store.listEntries();

    // Build map of existing DB entries to enable incremental updates.
    // This preserves embeddings for unchanged entries (avoids costly re-embedding).
    const existingMap = new Map<string, string>();
    try {
      const result = db.exec("SELECT category, filename, updated_at FROM documents");
      if (result.length > 0) {
        for (const row of result[0].values) {
          existingMap.set(`${row[0]}/${row[1]}`, row[2] as string);
        }
      }
    } catch {
      // Table may not exist yet on first run
    }

    const currentKeys = new Set<string>();

    for (const entry of entries) {
      const key = `${entry.category}/${entry.filename}`;
      currentKeys.add(key);

      const existingTimestamp = existingMap.get(key);
      const entryTimestamp = entry.lastModified.toISOString();

      // Skip if unchanged — preserves existing embeddings
      if (existingTimestamp === entryTimestamp) continue;

      // Remove old entry (triggers FTS5 delete trigger if applicable)
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
          entryTimestamp,
        ]
      );
    }

    // Remove entries that were deleted from disk
    for (const key of existingMap.keys()) {
      if (!currentKeys.has(key)) {
        const slashIdx = key.indexOf("/");
        const cat = key.slice(0, slashIdx);
        const fname = key.slice(slashIdx + 1);
        db.run("DELETE FROM documents WHERE category = ? AND filename = ?", [cat, fname]);
      }
    }

    // Only embed entries that don't have embeddings yet (new/changed ones)
    if (this.embeddingProvider) {
      await this.embedMissingEntries(entries);
    }

    // Invalidate in-memory cache so next semantic query reloads fresh embeddings
    this.embeddingCacheDirty = true;

    this.save();
  }

  private async embedMissingEntries(entries: ContextEntry[]): Promise<void> {
    if (!this.embeddingProvider || !this.db) return;

    // Find entries without embeddings
    const result = this.db.exec(
      "SELECT category, filename FROM documents WHERE embedding IS NULL OR embedding_dims = 0"
    );

    if (!result.length || !result[0].values.length) return;

    const missing = result[0].values.map((row) => ({
      category: row[0] as string,
      filename: row[1] as string,
    }));

    // Batch embed (up to 20 at a time to avoid API limits)
    const batchSize = 20;
    for (let i = 0; i < missing.length; i += batchSize) {
      const batch = missing.slice(i, i + batchSize);
      const texts = batch.map((m) => {
        const entry = entries.find(
          (e) => e.category === m.category && e.filename === m.filename
        );
        if (!entry) return "";
        return `${entry.title}\n\n${entry.content}`.slice(0, 8000);
      });

      try {
        const embeddings = await this.embeddingProvider.embed(texts);
        for (let j = 0; j < batch.length; j++) {
          const blob = new Uint8Array(embeddings[j].buffer, embeddings[j].byteOffset, embeddings[j].byteLength);
          this.db!.run(
            "UPDATE documents SET embedding = ?, embedding_dims = ? WHERE category = ? AND filename = ?",
            [blob, this.embeddingProvider.dimensions, batch[j].category, batch[j].filename]
          );
        }
      } catch {
        // Skip this batch's embedding failures — keyword search still works
        continue;
      }
    }
  }

  async indexEntry(entry: ContextEntry): Promise<void> {
    const db = await this.ensureDb();

    db.run(
      "DELETE FROM documents WHERE category = ? AND filename = ?",
      [entry.category, entry.filename]
    );

    // Compute embedding if provider available
    let embeddingBlob: Uint8Array | null = null;
    let dims = 0;

    if (this.embeddingProvider) {
      try {
        const textToEmbed = `${entry.title}\n\n${entry.content}`.slice(0, 8000);
        const [embedding] = await this.embeddingProvider.embed([textToEmbed]);
        embeddingBlob = new Uint8Array(embedding.buffer, embedding.byteOffset, embedding.byteLength);
        dims = this.embeddingProvider.dimensions;
      } catch {
        // Silently fall back to keyword-only for this entry
      }
    }

    db.run(
      `INSERT INTO documents (category, filename, title, content, relative_path, updated_at, embedding, embedding_dims)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.category,
        entry.filename,
        entry.title,
        entry.content,
        entry.relativePath,
        entry.lastModified.toISOString(),
        embeddingBlob,
        dims,
      ]
    );

    this.dirty = true;
    this.embeddingCacheDirty = true;
  }

  async removeEntry(category: string, filename: string): Promise<void> {
    const db = await this.ensureDb();
    db.run(
      "DELETE FROM documents WHERE category = ? AND filename = ?",
      [category, filename]
    );
    this.dirty = true;
    this.embeddingCacheDirty = true;
  }

  async search(query: string, category?: string, limit: number = 10): Promise<SearchResult[]> {
    // Get keyword results
    const keywordResults = this.hasFts5
      ? await this.searchFts5(query, category, limit * 2)
      : await this.searchLike(query, category, limit * 2);

    // If no embedding provider, return keyword results only
    if (!this.embeddingProvider) {
      return keywordResults.slice(0, limit);
    }

    // Attempt hybrid search
    try {
      const semanticResults = await this.searchSemantic(query, category, limit * 2);
      if (semanticResults.length === 0) {
        return keywordResults.slice(0, limit);
      }
      if (keywordResults.length === 0) {
        return semanticResults.slice(0, limit);
      }
      return this.hybridMerge(keywordResults, semanticResults, query, limit);
    } catch {
      return keywordResults.slice(0, limit);
    }
  }

  /** Fast FTS5 search — used when the sql.js build supports it */
  private async searchFts5(query: string, category?: string, limit: number = 10): Promise<SearchResult[]> {
    const db = await this.ensureDb();

    const terms = query
      .replace(/['"]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .map((term) => `"${term}"`)
      .join(" ");

    if (!terms) return [];

    let sql = `
      SELECT d.category, d.filename, d.title, d.content, d.relative_path,
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
        // Fall back to OR semantics with a fresh query
        const orTerms = query
          .replace(/['"]/g, "")
          .split(/\s+/)
          .filter(Boolean)
          .map((term) => `"${term}"`)
          .join(" OR ");

        if (orTerms !== terms) {
          let orSql = `
            SELECT d.category, d.filename, d.title, d.content, d.relative_path,
                   rank * -1 as score
            FROM documents_fts
            JOIN documents d ON d.id = documents_fts.rowid
            WHERE documents_fts MATCH ?
          `;
          const orParams: unknown[] = [orTerms];
          if (category) {
            orSql += " AND d.category = ?";
            orParams.push(category);
          }
          orSql += " ORDER BY rank LIMIT ?";
          orParams.push(limit);

          const orResults = db.exec(orSql, orParams);
          if (orResults.length && orResults[0].values.length) {
            return this.mapResults(orResults[0], query);
          }
        }
        return [];
      }
      return this.mapResults(results[0], query);
    } catch {
      // FTS query failed — fall back to LIKE
      return this.searchLike(query, category, limit);
    }
  }

  /** Fallback LIKE search — works everywhere, fine for <500 docs */
  private async searchLike(query: string, category?: string, limit: number = 10): Promise<SearchResult[]> {
    const db = await this.ensureDb();

    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];

    // Build scored query: title match = 3 points, content match = 1 point per term
    const scoreParts: string[] = [];
    const params: unknown[] = [];

    for (const term of terms) {
      const pattern = `%${term}%`;
      scoreParts.push(`(CASE WHEN LOWER(title) LIKE ? THEN 3 ELSE 0 END + CASE WHEN LOWER(category) LIKE ? THEN 2 ELSE 0 END + CASE WHEN LOWER(content) LIKE ? THEN 1 ELSE 0 END)`);
      params.push(pattern, pattern, pattern);
    }

    let sql = `
      SELECT * FROM (
        SELECT category, filename, title, content, relative_path,
               (${scoreParts.join(" + ")}) as score
        FROM documents
      ) WHERE score > 0
    `;

    if (category) {
      sql += " AND category = ?";
      params.push(category);
    }

    sql += " ORDER BY score DESC LIMIT ?";
    params.push(limit);

    try {
      const results = db.exec(sql, params);
      if (!results.length || !results[0].values.length) return [];
      return this.mapResults(results[0], query);
    } catch {
      return [];
    }
  }

  /**
   * Load (or return cached) in-memory embedding array.
   * This avoids re-fetching all embedding blobs from SQLite on every semantic query.
   * Cache is invalidated whenever indexEntry() or removeEntry() is called.
   */
  private async getEmbeddingCache(): Promise<CachedEmbedding[]> {
    if (this.embeddingCache !== null && !this.embeddingCacheDirty) {
      return this.embeddingCache;
    }

    const db = await this.ensureDb();
    const results = db.exec(
      "SELECT category, filename, title, content, relative_path, embedding, embedding_dims FROM documents WHERE embedding IS NOT NULL AND embedding_dims > 0"
    );

    const cache: CachedEmbedding[] = [];

    if (results.length && results[0].values.length) {
      for (const row of results[0].values) {
        const embBlob = row[5] as Uint8Array;
        const dims = row[6] as number;
        if (!embBlob || dims === 0 || embBlob.byteLength !== dims * 4) continue;

        // Copy buffer out of sql.js WASM heap before caching
        const buffer = new ArrayBuffer(dims * 4);
        new Uint8Array(buffer).set(new Uint8Array(embBlob.buffer, embBlob.byteOffset, dims * 4));

        cache.push({
          category: row[0] as string,
          filename: row[1] as string,
          title: row[2] as string,
          content: row[3] as string,
          relativePath: row[4] as string,
          embedding: new Float32Array(buffer),
        });
      }
    }

    this.embeddingCache = cache;
    this.embeddingCacheDirty = false;
    return cache;
  }

  /** Semantic search using in-memory cached embeddings + cosine similarity */
  private async searchSemantic(
    query: string,
    category?: string,
    limit: number = 10
  ): Promise<SearchResult[]> {
    if (!this.embeddingProvider) return [];

    const [queryEmbedding] = await this.embeddingProvider.embed([query]);
    const cache = await this.getEmbeddingCache();

    if (cache.length === 0) return [];

    const scored: SearchResult[] = [];
    for (const doc of cache) {
      if (category && doc.category !== category) continue;
      if (doc.embedding.length !== queryEmbedding.length) continue;

      const similarity = cosineSimilarity(queryEmbedding, doc.embedding);
      scored.push({
        category: doc.category,
        filename: doc.filename,
        title: doc.title,
        snippet: this.extractSnippet(doc.content, query),
        score: similarity,
        relativePath: doc.relativePath,
      });
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /** Merge keyword and semantic results with weighted scoring */
  hybridMerge(
    keywordResults: SearchResult[],
    semanticResults: SearchResult[],
    query: string,
    limit: number
  ): SearchResult[] {
    // Normalize scores to [0, 1] using min-max normalization (handles negative FTS5 scores)
    const keywordScores = keywordResults.map((r) => r.score);
    const minKeyword = keywordScores.length > 0 ? Math.min(...keywordScores) : 0;
    const maxKeyword = keywordScores.length > 0 ? Math.max(...keywordScores) : 0;
    const keywordRange = maxKeyword - minKeyword || 0.001;

    const semanticScores = semanticResults.map((r) => r.score);
    const minSemantic = semanticScores.length > 0 ? Math.min(...semanticScores) : 0;
    const maxSemantic = semanticScores.length > 0 ? Math.max(...semanticScores) : 0;
    const semanticRange = maxSemantic - minSemantic || 0.001;

    const scoreMap = new Map<
      string,
      { keyword: number; semantic: number; result: SearchResult }
    >();

    for (const r of keywordResults) {
      const key = `${r.category}/${r.filename}`;
      scoreMap.set(key, {
        keyword: (r.score - minKeyword) / keywordRange,
        semantic: 0,
        result: r,
      });
    }

    for (const r of semanticResults) {
      const key = `${r.category}/${r.filename}`;
      const existing = scoreMap.get(key);
      if (existing) {
        existing.semantic = (r.score - minSemantic) / semanticRange;
      } else {
        scoreMap.set(key, {
          keyword: 0,
          semantic: (r.score - minSemantic) / semanticRange,
          result: r,
        });
      }
    }

    return Array.from(scoreMap.values())
      .map(({ keyword, semantic, result }) => ({
        ...result,
        score: this.alpha * keyword + (1 - this.alpha) * semantic,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
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
    } catch (e) {
      console.error("Warning: Could not save search index:", e);
    }
  }

  close(): void {
    if (this.db) {
      if (this.dirty) {
        this.save();
        this.dirty = false;
      }
      this.db.close();
      this.db = null;
    }
  }
}
