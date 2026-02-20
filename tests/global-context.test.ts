import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { ContextStore } from "../src/lib/context-store.js";
import { SearchIndex } from "../src/lib/search.js";
import { DEFAULT_CONFIG } from "../src/lib/config.js";
import type { RepoContextConfig } from "../src/lib/config.js";

function makeConfig(overrides?: Partial<RepoContextConfig>): RepoContextConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

describe("Global Context Layer", () => {
  let repoDir: string;
  let globalDir: string;
  let repoStore: ContextStore;
  let globalStore: ContextStore;

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), "repo-test-"));
    globalDir = mkdtempSync(join(tmpdir(), "global-test-"));
    repoStore = new ContextStore(repoDir, makeConfig());
    globalStore = ContextStore.forAbsolutePath(globalDir);
    repoStore.scaffold();
    globalStore.scaffold();
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
    rmSync(globalDir, { recursive: true, force: true });
  });

  describe("ContextStore.forAbsolutePath", () => {
    it("creates store at absolute path", () => {
      expect(globalStore.exists()).toBe(true);
      expect(globalStore.path).toBe(globalDir);
    });

    it("scaffolds all category directories", () => {
      expect(existsSync(join(globalDir, "preferences"))).toBe(true);
      expect(existsSync(join(globalDir, "facts"))).toBe(true);
      expect(existsSync(join(globalDir, "decisions"))).toBe(true);
      expect(existsSync(join(globalDir, "regressions"))).toBe(true);
      expect(existsSync(join(globalDir, "sessions"))).toBe(true);
      expect(existsSync(join(globalDir, "changelog"))).toBe(true);
    });

    it("writes and reads entries", () => {
      globalStore.writeEntry("preferences", "test-pref", "# Test\nPrefer tabs.");
      const content = globalStore.readEntry("preferences", "test-pref.md");
      expect(content).toBe("# Test\nPrefer tabs.");
    });

    it("lists entries correctly", () => {
      globalStore.writeEntry("preferences", "style-a", "# Style A\nContent");
      globalStore.writeEntry("preferences", "style-b", "# Style B\nContent");

      const entries = globalStore.listEntries("preferences");
      expect(entries.length).toBe(2);
    });

    it("deletes entries", () => {
      globalStore.writeEntry("preferences", "deleteme", "# Delete\nContent");
      expect(globalStore.readEntry("preferences", "deleteme.md")).not.toBeNull();

      const deleted = globalStore.deleteEntry("preferences", "deleteme.md");
      expect(deleted).toBe(true);
      expect(globalStore.readEntry("preferences", "deleteme.md")).toBeNull();
    });

    it("returns relative paths from the global root", () => {
      const path = globalStore.writeEntry("preferences", "test", "content");
      expect(path).toBe(join("preferences", "test.md"));
    });
  });

  describe("search across stores", () => {
    it("searches repo and global independently", async () => {
      repoStore.writeEntry("facts", "auth", "# Auth\nRepo authentication flow with JWT.");
      globalStore.writeEntry("preferences", "style", "# Style\nPrefer Tailwind CSS.");

      const repoIndex = new SearchIndex(repoStore.path, repoStore);
      const globalIndex = new SearchIndex(globalStore.path, globalStore);
      await repoIndex.rebuild();
      await globalIndex.rebuild();

      const repoResults = await repoIndex.search("authentication");
      expect(repoResults.length).toBe(1);
      expect(repoResults[0].category).toBe("facts");

      const globalResults = await globalIndex.search("Tailwind");
      expect(globalResults.length).toBe(1);
      expect(globalResults[0].category).toBe("preferences");

      repoIndex.close();
      globalIndex.close();
    });

    it("repo entries shadow global with same category/filename", () => {
      globalStore.writeEntry("preferences", "style", "# Style\nGlobal: use Tailwind");
      repoStore.writeEntry("preferences", "style", "# Style\nRepo: use Bootstrap (legacy)");

      const globalEntries = globalStore.listEntries("preferences");
      const repoEntries = repoStore.listEntries("preferences");

      // Simulate merge logic (repo-first dedup)
      const seen = new Set(repoEntries.map((e) => `${e.category}/${e.filename}`));
      const merged = [...repoEntries, ...globalEntries.filter((e) => !seen.has(`${e.category}/${e.filename}`))];

      expect(merged.length).toBe(1);
      expect(merged[0].content).toContain("Bootstrap");
    });
  });

  describe("scope routing", () => {
    it("preferences default to global", () => {
      // Simulating the resolveScope logic from server.ts
      const resolveScope = (category: string, explicit?: string) => {
        if (explicit === "repo" || explicit === "global") return explicit;
        if (category === "preferences") return "global";
        return "repo";
      };

      expect(resolveScope("preferences")).toBe("global");
      expect(resolveScope("facts")).toBe("repo");
      expect(resolveScope("decisions")).toBe("repo");
      expect(resolveScope("regressions")).toBe("repo");
      expect(resolveScope("sessions")).toBe("repo");
      expect(resolveScope("changelog")).toBe("repo");
    });

    it("explicit scope overrides defaults", () => {
      const resolveScope = (category: string, explicit?: string) => {
        if (explicit === "repo" || explicit === "global") return explicit;
        if (category === "preferences") return "global";
        return "repo";
      };

      expect(resolveScope("preferences", "repo")).toBe("repo");
      expect(resolveScope("facts", "global")).toBe("global");
    });
  });

  describe("auto-orient with global preferences", () => {
    it("includes global preferences even without repo context", () => {
      globalStore.writeEntry("preferences", "style", "# Coding Style\nPrefer functional components.");

      const prefs = globalStore.listEntries("preferences");
      expect(prefs.length).toBe(1);
      expect(prefs[0].title).toBe("Coding Style");
      expect(prefs[0].content).toContain("functional components");
    });

    it("repo preferences shadow global in merged view", () => {
      globalStore.writeEntry("preferences", "testing", "# Testing\nGlobal: Use Vitest.");
      repoStore.writeEntry("preferences", "testing", "# Testing\nRepo: Use Jest (legacy).");

      const globalPrefs = globalStore.listEntries("preferences");
      const repoPrefs = repoStore.listEntries("preferences");

      const seen = new Set(repoPrefs.map((p) => p.filename));
      const merged = [...repoPrefs, ...globalPrefs.filter((p) => !seen.has(p.filename))];

      expect(merged.length).toBe(1);
      expect(merged[0].content).toContain("Jest");
    });
  });
});
