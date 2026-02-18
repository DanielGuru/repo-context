import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, existsSync, readFileSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { ContextStore } from "../src/lib/context-store.js";
import { DEFAULT_CONFIG } from "../src/lib/config.js";
import type { RepoContextConfig } from "../src/lib/config.js";

function makeConfig(overrides?: Partial<RepoContextConfig>): RepoContextConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

describe("ContextStore", () => {
  let tempDir: string;
  let store: ContextStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "repomemory-store-test-"));
    store = new ContextStore(tempDir, makeConfig());
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("scaffold", () => {
    it("creates all required directories", () => {
      store.scaffold();

      expect(existsSync(join(tempDir, ".context"))).toBe(true);
      expect(existsSync(join(tempDir, ".context", "facts"))).toBe(true);
      expect(existsSync(join(tempDir, ".context", "decisions"))).toBe(true);
      expect(existsSync(join(tempDir, ".context", "regressions"))).toBe(true);
      expect(existsSync(join(tempDir, ".context", "sessions"))).toBe(true);
      expect(existsSync(join(tempDir, ".context", "changelog"))).toBe(true);
      expect(existsSync(join(tempDir, ".context", "preferences"))).toBe(true);
    });

    it("creates a .gitignore file", () => {
      store.scaffold();

      const gitignorePath = join(tempDir, ".context", ".gitignore");
      expect(existsSync(gitignorePath)).toBe(true);
      const content = readFileSync(gitignorePath, "utf-8");
      expect(content).toContain(".search.db");
      expect(content).toContain(".last-response.txt");
    });

    it("does not overwrite existing .gitignore", () => {
      store.scaffold();
      const gitignorePath = join(tempDir, ".context", ".gitignore");

      // Manually modify .gitignore
      writeFileSync(gitignorePath, "custom-content\n");

      // scaffold again
      store.scaffold();
      const content = readFileSync(gitignorePath, "utf-8");
      expect(content).toBe("custom-content\n");
    });

    it("is idempotent (calling twice does not error)", () => {
      store.scaffold();
      expect(() => store.scaffold()).not.toThrow();
    });
  });

  describe("exists", () => {
    it("returns false before scaffold", () => {
      expect(store.exists()).toBe(false);
    });

    it("returns true after scaffold", () => {
      store.scaffold();
      expect(store.exists()).toBe(true);
    });
  });

  describe("path", () => {
    it("returns the full context directory path", () => {
      expect(store.path).toBe(join(tempDir, ".context"));
    });

    it("respects custom contextDir", () => {
      const customStore = new ContextStore(
        tempDir,
        makeConfig({ contextDir: ".my-context" })
      );
      expect(customStore.path).toBe(join(tempDir, ".my-context"));
    });
  });

  describe("writeEntry", () => {
    beforeEach(() => {
      store.scaffold();
    });

    it("writes a file to the correct category directory", () => {
      store.writeEntry("facts", "architecture", "# Architecture\nDetails here.");

      const filePath = join(tempDir, ".context", "facts", "architecture.md");
      expect(existsSync(filePath)).toBe(true);
      expect(readFileSync(filePath, "utf-8")).toBe(
        "# Architecture\nDetails here."
      );
    });

    it("sanitizes filenames (lowercase, remove special chars)", () => {
      store.writeEntry("facts", "My Cool File", "content");

      const filePath = join(tempDir, ".context", "facts", "my-cool-file.md");
      expect(existsSync(filePath)).toBe(true);
    });

    it("adds .md extension if not present", () => {
      store.writeEntry("facts", "no-extension", "content");

      const filePath = join(tempDir, ".context", "facts", "no-extension.md");
      expect(existsSync(filePath)).toBe(true);
    });

    it("does not double the .md extension", () => {
      store.writeEntry("facts", "already.md", "content");

      const filePath = join(tempDir, ".context", "facts", "already.md");
      expect(existsSync(filePath)).toBe(true);
      // Should NOT create already.md.md
      expect(existsSync(join(tempDir, ".context", "facts", "already.md.md"))).toBe(false);
    });

    it("returns a relative path from the repo root", () => {
      const result = store.writeEntry("facts", "test", "content");
      expect(result).toBe(join(".context", "facts", "test.md"));
    });

    it("validates categories and throws on invalid category", () => {
      expect(() =>
        store.writeEntry("invalid-category", "test", "content")
      ).toThrow(/Invalid category/);
    });

    it("accepts all valid categories", () => {
      const validCategories = [
        "facts",
        "decisions",
        "regressions",
        "sessions",
        "changelog",
        "preferences",
      ];
      for (const cat of validCategories) {
        expect(() =>
          store.writeEntry(cat, `test-${cat}`, "content")
        ).not.toThrow();
      }
    });

    it("overwrites existing files", () => {
      store.writeEntry("facts", "overwrite-test", "original");
      store.writeEntry("facts", "overwrite-test", "updated");

      const content = readFileSync(
        join(tempDir, ".context", "facts", "overwrite-test.md"),
        "utf-8"
      );
      expect(content).toBe("updated");
    });

    it("collapses consecutive hyphens in sanitized filenames", () => {
      store.writeEntry("facts", "name---with---hyphens", "content");
      const filePath = join(
        tempDir,
        ".context",
        "facts",
        "name-with-hyphens.md"
      );
      expect(existsSync(filePath)).toBe(true);
    });

    it("strips leading hyphens from sanitized filenames", () => {
      store.writeEntry("facts", "---leading", "content");
      const filePath = join(
        tempDir,
        ".context",
        "facts",
        "leading.md"
      );
      expect(existsSync(filePath)).toBe(true);
    });

    it("handles all-unicode filenames without collisions", () => {
      store.writeEntry("facts", "\u8ba4\u8bc1\u6d41\u7a0b", "content1");
      store.writeEntry("facts", "\u6570\u636e\u5e93", "content2");

      const entries = store.listEntries("facts");
      expect(entries.length).toBe(2);
      // Both should have unique, non-empty filenames
      expect(entries[0].filename).not.toBe(entries[1].filename);
      expect(entries[0].filename.length).toBeGreaterThan(3);
    });

    it("transliterates accented characters in filenames", () => {
      store.writeEntry("facts", "caf\u00e9-r\u00e9sum\u00e9", "content");
      const entries = store.listEntries("facts");
      expect(entries.length).toBe(1);
      expect(entries[0].filename).toBe("cafe-resume.md");
    });

    it("preserves transliterable unicode instead of stripping", () => {
      store.writeEntry("facts", "\u00fcber-na\u00efve-fa\u00e7ade", "content");
      const entries = store.listEntries("facts");
      expect(entries.length).toBe(1);
      expect(entries[0].filename).toBe("uber-naive-facade.md");
    });
  });

  describe("readEntry", () => {
    beforeEach(() => {
      store.scaffold();
    });

    it("returns null for missing files", () => {
      const result = store.readEntry("facts", "nonexistent.md");
      expect(result).toBeNull();
    });

    it("reads an existing entry by exact filename", () => {
      store.writeEntry("facts", "test-read", "# Test\nContent here.");
      const result = store.readEntry("facts", "test-read.md");
      expect(result).toBe("# Test\nContent here.");
    });

    it("falls back to sanitized filename when exact match fails", () => {
      store.writeEntry("facts", "My Entry", "content");
      // The file is stored as "my-entry.md"
      // readEntry should try sanitized version if the exact name fails
      const result = store.readEntry("facts", "My Entry");
      expect(result).toBe("content");
    });

    it("validates category and rejects invalid categories", () => {
      expect(() => store.readEntry("../etc", "passwd")).toThrow(/Invalid category/);
      expect(() => store.readEntry("invalid", "test.md")).toThrow(/Invalid category/);
    });
  });

  describe("deleteEntry", () => {
    beforeEach(() => {
      store.scaffold();
    });

    it("removes an existing file and returns true", () => {
      store.writeEntry("facts", "to-delete", "content");
      const result = store.deleteEntry("facts", "to-delete");
      expect(result).toBe(true);
      expect(
        existsSync(join(tempDir, ".context", "facts", "to-delete.md"))
      ).toBe(false);
    });

    it("returns false for a non-existent file", () => {
      const result = store.deleteEntry("facts", "does-not-exist");
      expect(result).toBe(false);
    });

    it("validates category and rejects invalid categories", () => {
      expect(() => store.deleteEntry("../etc", "passwd")).toThrow(/Invalid category/);
    });
  });

  describe("appendEntry", () => {
    beforeEach(() => {
      store.scaffold();
    });

    it("creates a new file if it does not exist", () => {
      store.appendEntry("sessions", "new-session", "Session content.");
      const filePath = join(
        tempDir,
        ".context",
        "sessions",
        "new-session.md"
      );
      expect(existsSync(filePath)).toBe(true);
      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain("Session content.");
    });

    it("appends to an existing file", () => {
      store.writeEntry("sessions", "append-test", "First part.");
      store.appendEntry("sessions", "append-test", "Second part.");

      const content = readFileSync(
        join(tempDir, ".context", "sessions", "append-test.md"),
        "utf-8"
      );
      expect(content).toContain("First part.");
      expect(content).toContain("Second part.");
    });

    it("separates appended content with double newlines", () => {
      store.writeEntry("sessions", "sep-test", "A");
      store.appendEntry("sessions", "sep-test", "B");

      const content = readFileSync(
        join(tempDir, ".context", "sessions", "sep-test.md"),
        "utf-8"
      );
      expect(content).toBe("A\n\nB");
    });

    it("validates category", () => {
      expect(() =>
        store.appendEntry("bad-cat", "test", "content")
      ).toThrow(/Invalid category/);
    });

    it("does not prepend blank lines on new files", () => {
      store.appendEntry("sessions", "no-blanks", "First content.");
      const filePath = join(
        tempDir,
        ".context",
        "sessions",
        "no-blanks.md"
      );
      const content = readFileSync(filePath, "utf-8");
      expect(content).toBe("First content.");
      expect(content.startsWith("\n")).toBe(false);
    });
  });

  describe("writeIndex / readIndex", () => {
    beforeEach(() => {
      store.scaffold();
    });

    it("writes and reads index.md", () => {
      store.writeIndex("# My Project\nOverview here.");
      const result = store.readIndex();
      expect(result).toBe("# My Project\nOverview here.");
    });

    it("returns empty string when index.md does not exist", () => {
      const result = store.readIndex();
      expect(result).toBe("");
    });
  });

  describe("listEntries", () => {
    beforeEach(() => {
      store.scaffold();
    });

    it("returns an empty array when no entries exist", () => {
      const entries = store.listEntries();
      expect(entries).toEqual([]);
    });

    it("returns all entries across categories", () => {
      store.writeEntry("facts", "architecture", "# Architecture");
      store.writeEntry("decisions", "tech-stack", "# Tech Stack");
      store.writeEntry("regressions", "bug-one", "# Bug One");

      const entries = store.listEntries();
      const filenames = entries.map((e) => e.filename);
      expect(filenames).toContain("architecture.md");
      expect(filenames).toContain("tech-stack.md");
      expect(filenames).toContain("bug-one.md");
    });

    it("includes index.md as a root entry when listing all", () => {
      store.writeIndex("# Index");
      store.writeEntry("facts", "test", "content");

      const entries = store.listEntries();
      const indexEntry = entries.find(
        (e) => e.category === "root" && e.filename === "index.md"
      );
      expect(indexEntry).toBeDefined();
      expect(indexEntry!.title).toBe("Index");
    });

    it("filters by category when specified", () => {
      store.writeEntry("facts", "fact1", "content1");
      store.writeEntry("decisions", "dec1", "content2");

      const factsOnly = store.listEntries("facts");
      expect(factsOnly).toHaveLength(1);
      expect(factsOnly[0].category).toBe("facts");
      expect(factsOnly[0].filename).toBe("fact1.md");
    });

    it("does not include index.md when filtering by category", () => {
      store.writeIndex("# Index");
      store.writeEntry("facts", "test", "content");

      const factsOnly = store.listEntries("facts");
      const indexEntry = factsOnly.find((e) => e.filename === "index.md");
      expect(indexEntry).toBeUndefined();
    });

    it("extracts title from first markdown heading", () => {
      store.writeEntry("facts", "titled", "# My Great Title\nSome content.");

      const entries = store.listEntries("facts");
      expect(entries[0].title).toBe("My Great Title");
    });

    it("uses filename as title fallback when no heading exists", () => {
      store.writeEntry("facts", "no-heading", "Just plain content.");

      const entries = store.listEntries("facts");
      expect(entries[0].title).toBe("no heading");
    });

    it("populates sizeBytes and lastModified", () => {
      store.writeEntry("facts", "sized", "Some content here.");

      const entries = store.listEntries("facts");
      expect(entries[0].sizeBytes).toBeGreaterThan(0);
      expect(entries[0].lastModified).toBeInstanceOf(Date);
    });

    it("populates relativePath correctly", () => {
      store.writeEntry("facts", "pathed", "content");

      const entries = store.listEntries("facts");
      expect(entries[0].relativePath).toBe(
        join(".context", "facts", "pathed.md")
      );
    });

    it("skips hidden files (dotfiles)", () => {
      store.writeEntry("facts", "visible", "content");
      // Manually create a hidden file
      writeFileSync(
        join(tempDir, ".context", "facts", ".hidden.md"),
        "hidden"
      );

      const entries = store.listEntries("facts");
      expect(entries).toHaveLength(1);
      expect(entries[0].filename).toBe("visible.md");
    });
  });

  describe("getStats", () => {
    beforeEach(() => {
      store.scaffold();
    });

    it("returns zero counts when empty", () => {
      const stats = store.getStats();
      expect(stats.totalFiles).toBe(0);
      expect(stats.totalSize).toBe(0);
      expect(stats.categories).toEqual({});
    });

    it("returns correct counts per category", () => {
      store.writeEntry("facts", "f1", "content1");
      store.writeEntry("facts", "f2", "content2");
      store.writeEntry("decisions", "d1", "content3");
      store.writeIndex("# Index");

      const stats = store.getStats();
      expect(stats.totalFiles).toBe(4); // 2 facts + 1 decision + 1 index
      expect(stats.categories["facts"]).toBe(2);
      expect(stats.categories["decisions"]).toBe(1);
      expect(stats.categories["root"]).toBe(1);
    });

    it("returns correct totalSize", () => {
      store.writeEntry("facts", "sized", "abcdef"); // 6 bytes

      const stats = store.getStats();
      expect(stats.totalSize).toBe(6);
    });

    it("tracks stalest and newest files", () => {
      store.writeEntry("facts", "first", "content");
      // Small delay to ensure different timestamps
      store.writeEntry("facts", "second", "content");

      const stats = store.getStats();
      expect(stats.stalestFile).toBeDefined();
      expect(stats.newestFile).toBeDefined();
      expect(stats.stalestFile!.age).toBeGreaterThanOrEqual(-10);
      expect(stats.newestFile!.age).toBeGreaterThanOrEqual(-10);
    });
  });

  describe("getAllContent", () => {
    beforeEach(() => {
      store.scaffold();
    });

    it("returns empty string when no entries exist", () => {
      const content = store.getAllContent();
      expect(content).toBe("");
    });

    it("concatenates all entries with separators", () => {
      store.writeEntry("facts", "f1", "fact content");
      store.writeEntry("decisions", "d1", "decision content");

      const content = store.getAllContent();
      expect(content).toContain("facts/f1.md");
      expect(content).toContain("fact content");
      expect(content).toContain("decisions/d1.md");
      expect(content).toContain("decision content");
    });
  });
});
