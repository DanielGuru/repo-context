import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { SearchIndex } from "../src/lib/search.js";
import { ContextStore } from "../src/lib/context-store.js";

describe("SearchIndex", () => {
  let tempDir: string;
  let store: ContextStore;
  let contextDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "search-test-"));
    store = new ContextStore(tempDir, {
      provider: "anthropic",
      model: "test",
      ignorePatterns: [],
      keyFilePatterns: [],
      maxFileSize: 100000,
      maxFilesForAnalysis: 80,
      maxGitCommits: 100,
      categories: ["facts", "decisions", "regressions", "sessions", "changelog", "preferences"],
      autoIndex: true,
      contextDir: ".context",
      hybridAlpha: 0.5,
    });
    store.scaffold();
    contextDir = store.path;
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("builds an index from context entries", async () => {
    store.writeEntry("facts", "test-fact", "# Test Fact\n\nThis is about authentication flow.");
    store.writeEntry("decisions", "why-jwt", "# Why JWT\n\nWe chose JWT because it's stateless.");

    const index = new SearchIndex(contextDir, store);
    await index.rebuild();

    const results = await index.search("authentication");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].category).toBe("facts");

    index.close();
  });

  it("searches across categories", async () => {
    store.writeEntry("facts", "auth", "# Auth\n\nLogin uses OAuth2.");
    store.writeEntry("regressions", "auth-bug", "# Auth Bug\n\nLogin broke after OAuth2 migration.");

    const index = new SearchIndex(contextDir, store);
    await index.rebuild();

    const results = await index.search("OAuth2");
    expect(results.length).toBe(2);

    index.close();
  });

  it("filters by category", async () => {
    store.writeEntry("facts", "auth", "# Auth\n\nLogin uses OAuth2.");
    store.writeEntry("regressions", "auth-bug", "# Auth Bug\n\nLogin broke after OAuth2 migration.");

    const index = new SearchIndex(contextDir, store);
    await index.rebuild();

    const results = await index.search("OAuth2", "facts");
    expect(results.length).toBe(1);
    expect(results[0].category).toBe("facts");

    index.close();
  });

  it("handles incremental indexing", async () => {
    const index = new SearchIndex(contextDir, store);
    await index.rebuild();

    // Initially empty
    const emptyResults = await index.search("newterm");
    expect(emptyResults.length).toBe(0);

    // Write and index a new entry
    store.writeEntry("facts", "new-entry", "# New Entry\n\nnewterm is important.");
    const entry = store.listEntries("facts").find((e) => e.filename === "new-entry.md");
    expect(entry).toBeDefined();
    await index.indexEntry(entry!);

    const results = await index.search("newterm");
    expect(results.length).toBe(1);

    index.close();
  });

  it("handles entry removal", async () => {
    store.writeEntry("facts", "removable", "# Removable\n\nThis entry will be removed.");

    const index = new SearchIndex(contextDir, store);
    await index.rebuild();

    let results = await index.search("removable");
    expect(results.length).toBe(1);

    await index.removeEntry("facts", "removable.md");

    results = await index.search("removable");
    expect(results.length).toBe(0);

    index.close();
  });

  it("persists and loads from disk", async () => {
    store.writeEntry("facts", "persist-test", "# Persist\n\nThis should persist to disk.");

    const index1 = new SearchIndex(contextDir, store);
    await index1.rebuild();

    const results1 = await index1.search("persist");
    expect(results1.length).toBe(1);
    index1.close();

    // Create a new index — should load from disk
    const index2 = new SearchIndex(contextDir, store);
    await index2.rebuild();

    const results2 = await index2.search("persist");
    expect(results2.length).toBe(1);
    index2.close();
  });

  it("handles preferences category", async () => {
    store.writeEntry(
      "preferences",
      "coding-style",
      "# Coding Style\n\nPrefer functional components over class components."
    );

    const index = new SearchIndex(contextDir, store);
    await index.rebuild();

    const results = await index.search("functional components", "preferences");
    expect(results.length).toBe(1);
    expect(results[0].category).toBe("preferences");

    index.close();
  });

  it("returns empty results for no matches", async () => {
    store.writeEntry("facts", "auth", "# Auth\n\nLogin uses OAuth2.");

    const index = new SearchIndex(contextDir, store);
    await index.rebuild();

    const results = await index.search("zzzznonexistent");
    expect(results.length).toBe(0);

    index.close();
  });

  it("embedding cache is invalidated after indexEntry and removeEntry", async () => {
    store.writeEntry("facts", "cache-test", "# Cache Test\n\nEntry for cache invalidation check.");

    const index = new SearchIndex(contextDir, store);
    await index.rebuild();

    // First search — primes the cache path
    let results = await index.search("cache invalidation");
    // May or may not find without semantic provider, but no crash
    expect(Array.isArray(results)).toBe(true);

    // Add a new entry directly (bypasses rebuild)
    const newEntry = store.listEntries().find((e) => e.filename === "cache-test.md")!;
    await index.indexEntry({ ...newEntry, title: "Cache Updated", content: "# Cache Updated\n\nModified entry." });

    // Remove it
    await index.removeEntry("facts", "cache-test.md");

    results = await index.search("cache-test");
    expect(results.length).toBe(0);

    index.close();
  });

  it("returns empty results for empty query", async () => {
    store.writeEntry("facts", "auth", "# Auth\n\nLogin uses OAuth2.");

    const index = new SearchIndex(contextDir, store);
    await index.rebuild();

    const results1 = await index.search("");
    expect(results1.length).toBe(0);

    const results2 = await index.search("   ");
    expect(results2.length).toBe(0);

    index.close();
  });

  it("finds entries by category name", async () => {
    store.writeEntry("regressions", "streaming-bug", "# Streaming Bug\n\nAnthropic SDK requires streaming.");
    store.writeEntry("regressions", "config-issue", "# Config Issue\n\nWrong config file path.");

    const index = new SearchIndex(contextDir, store);
    await index.rebuild();

    // Searching for the category name should match via the category column
    const results = await index.search("regressions");
    expect(results.length).toBeGreaterThan(0);

    index.close();
  });

  describe("hybridMerge", () => {
    it("merges overlapping results", async () => {
      const index = new SearchIndex(contextDir, store);
      await index.rebuild();

      const keyword = [
        {
          category: "facts",
          filename: "a.md",
          title: "A",
          snippet: "...",
          score: 10,
          relativePath: ".context/facts/a.md",
        },
        {
          category: "facts",
          filename: "b.md",
          title: "B",
          snippet: "...",
          score: 5,
          relativePath: ".context/facts/b.md",
        },
      ];

      const semantic = [
        {
          category: "facts",
          filename: "a.md",
          title: "A",
          snippet: "...",
          score: 0.9,
          relativePath: ".context/facts/a.md",
        },
        {
          category: "facts",
          filename: "c.md",
          title: "C",
          snippet: "...",
          score: 0.8,
          relativePath: ".context/facts/c.md",
        },
      ];

      const merged = index.hybridMerge(keyword, semantic, "test", 5);

      // "a.md" should be highest (present in both)
      expect(merged[0].filename).toBe("a.md");
      expect(merged.length).toBe(3); // a, b, c
      index.close();
    });

    it("preserves score spread without compressing to zero", async () => {
      const index = new SearchIndex(contextDir, store);
      await index.rebuild();

      const keyword = [
        {
          category: "facts",
          filename: "a.md",
          title: "A",
          snippet: "...",
          score: 8,
          relativePath: ".context/facts/a.md",
        },
        {
          category: "facts",
          filename: "b.md",
          title: "B",
          snippet: "...",
          score: 10,
          relativePath: ".context/facts/b.md",
        },
      ];
      const semantic = [
        {
          category: "facts",
          filename: "a.md",
          title: "A",
          snippet: "...",
          score: 0.85,
          relativePath: ".context/facts/a.md",
        },
        {
          category: "facts",
          filename: "b.md",
          title: "B",
          snippet: "...",
          score: 0.9,
          relativePath: ".context/facts/b.md",
        },
      ];

      const merged = index.hybridMerge(keyword, semantic, "test", 5);
      // b should be ranked higher (best in both keyword and semantic)
      expect(merged[0].filename).toBe("b.md");
      // Scores should have meaningful spread
      expect(merged[0].score - merged[1].score).toBeGreaterThan(0);
      index.close();
    });

    it("respects alpha weighting", async () => {
      const indexKeyword = new SearchIndex(contextDir, store, null, 1.0);
      await indexKeyword.rebuild();

      const keyword = [
        {
          category: "facts",
          filename: "kw.md",
          title: "KW",
          snippet: "...",
          score: 10,
          relativePath: ".context/facts/kw.md",
        },
      ];

      const semantic = [
        {
          category: "facts",
          filename: "sem.md",
          title: "SEM",
          snippet: "...",
          score: 0.99,
          relativePath: ".context/facts/sem.md",
        },
      ];

      // alpha=1.0 means keyword-only
      const merged = indexKeyword.hybridMerge(keyword, semantic, "test", 5);
      expect(merged[0].filename).toBe("kw.md");
      indexKeyword.close();
    });
  });
});
