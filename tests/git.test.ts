import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execFileSync } from "child_process";
import { getGitInfo, getLastCommitHash, getGitDiffSummary, getRecentDiffs } from "../src/lib/git.js";

describe("getGitInfo", () => {
  describe("non-git directory", () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), "repomemory-git-test-"));
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it("returns isGitRepo:false for a non-git directory", () => {
      const info = getGitInfo(tempDir, 100);
      expect(info.isGitRepo).toBe(false);
    });

    it("returns empty strings for all string fields in non-git dir", () => {
      const info = getGitInfo(tempDir, 100);
      expect(info.currentBranch).toBe("");
      expect(info.defaultBranch).toBe("");
      expect(info.remoteUrl).toBe("");
      expect(info.lastTagOrRelease).toBe("");
      expect(info.commitFrequency).toBe("");
    });

    it("returns zero for totalCommits in non-git dir", () => {
      const info = getGitInfo(tempDir, 100);
      expect(info.totalCommits).toBe(0);
    });

    it("returns empty arrays in non-git dir", () => {
      const info = getGitInfo(tempDir, 100);
      expect(info.contributors).toEqual([]);
      expect(info.recentCommits).toEqual([]);
      expect(info.activeBranches).toEqual([]);
    });
  });

  describe("git directory with commits", () => {
    let tempDir: string;

    function gitCmd(args: string[]) {
      return execFileSync("git", args, {
        cwd: tempDir,
        encoding: "utf-8",
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: "Test User",
          GIT_AUTHOR_EMAIL: "test@example.com",
          GIT_COMMITTER_NAME: "Test User",
          GIT_COMMITTER_EMAIL: "test@example.com",
        },
      });
    }

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), "repomemory-git-repo-test-"));
      gitCmd(["init", "-b", "main"]);
      writeFileSync(join(tempDir, "README.md"), "# Test\n");
      gitCmd(["add", "."]);
      gitCmd(["commit", "-m", "Initial commit"]);
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it("returns isGitRepo:true", () => {
      const info = getGitInfo(tempDir, 100);
      expect(info.isGitRepo).toBe(true);
    });

    it("returns the current branch name", () => {
      const info = getGitInfo(tempDir, 100);
      expect(info.currentBranch).toBe("main");
    });

    it("returns totalCommits >= 1", () => {
      const info = getGitInfo(tempDir, 100);
      expect(info.totalCommits).toBeGreaterThanOrEqual(1);
    });

    it("returns contributors list", () => {
      const info = getGitInfo(tempDir, 100);
      expect(info.contributors.length).toBeGreaterThanOrEqual(1);
      expect(info.contributors[0].name).toBe("Test User");
      expect(info.contributors[0].commits).toBeGreaterThanOrEqual(1);
    });

    it("returns recent commits with expected fields", () => {
      const info = getGitInfo(tempDir, 100);
      expect(info.recentCommits.length).toBeGreaterThanOrEqual(1);

      const commit = info.recentCommits[0];
      expect(commit.hash).toMatch(/^[a-f0-9]{40}$/);
      expect(commit.shortHash).toMatch(/^[a-f0-9]+$/);
      expect(commit.author).toBe("Test User");
      expect(commit.message).toBe("Initial commit");
      expect(commit.date).toBeTruthy();
    });

    it("respects maxCommits parameter", () => {
      // Create a second commit
      writeFileSync(join(tempDir, "file2.txt"), "content\n");
      gitCmd(["add", "."]);
      gitCmd(["commit", "-m", "Second commit"]);

      const info = getGitInfo(tempDir, 1);
      expect(info.recentCommits.length).toBeLessThanOrEqual(1);
    });

    it("includes activeBranches", () => {
      const info = getGitInfo(tempDir, 100);
      expect(info.activeBranches).toContain("main");
    });

    it("detects commit frequency", () => {
      const info = getGitInfo(tempDir, 100);
      // With only 1 commit, it should be "low" or some frequency string
      expect(info.commitFrequency).toBeTruthy();
    });
  });
});

describe("getLastCommitHash", () => {
  let tempDir: string;

  function gitCmd(args: string[]) {
    return execFileSync("git", args, {
      cwd: tempDir,
      encoding: "utf-8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "Test User",
        GIT_AUTHOR_EMAIL: "test@example.com",
        GIT_COMMITTER_NAME: "Test User",
        GIT_COMMITTER_EMAIL: "test@example.com",
      },
    });
  }

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "repomemory-hash-test-"));
    gitCmd(["init", "-b", "main"]);
    writeFileSync(join(tempDir, "test.txt"), "content\n");
    gitCmd(["add", "."]);
    gitCmd(["commit", "-m", "Initial"]);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns a 40-character hex hash", () => {
    const hash = getLastCommitHash(tempDir);
    expect(hash).toMatch(/^[a-f0-9]{40}$/);
  });

  it("returns empty string for non-git directory", () => {
    const nonGitDir = mkdtempSync(join(tmpdir(), "repomemory-nongit-"));
    try {
      const hash = getLastCommitHash(nonGitDir);
      expect(hash).toBe("");
    } finally {
      rmSync(nonGitDir, { recursive: true, force: true });
    }
  });
});

describe("getGitDiffSummary", () => {
  let tempDir: string;

  function gitCmd(args: string[]) {
    return execFileSync("git", args, {
      cwd: tempDir,
      encoding: "utf-8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "Test User",
        GIT_AUTHOR_EMAIL: "test@example.com",
        GIT_COMMITTER_NAME: "Test User",
        GIT_COMMITTER_EMAIL: "test@example.com",
      },
    });
  }

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "repomemory-diff-test-"));
    gitCmd(["init", "-b", "main"]);
    writeFileSync(join(tempDir, "test.txt"), "content\n");
    gitCmd(["add", "."]);
    gitCmd(["commit", "-m", "Initial"]);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns a string (may be empty if no commits since date)", () => {
    const summary = getGitDiffSummary(tempDir, "2000-01-01");
    expect(typeof summary).toBe("string");
    // Should contain something since the commit is after 2000
    expect(summary).toContain("Initial");
  });

  it("returns empty string for non-git directory", () => {
    const nonGitDir = mkdtempSync(join(tmpdir(), "repomemory-nongit2-"));
    try {
      const summary = getGitDiffSummary(nonGitDir, "2000-01-01");
      expect(summary).toBe("");
    } finally {
      rmSync(nonGitDir, { recursive: true, force: true });
    }
  });
});

describe("getRecentDiffs", () => {
  let tempDir: string;

  function gitCmd(args: string[]) {
    return execFileSync("git", args, {
      cwd: tempDir,
      encoding: "utf-8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "Test User",
        GIT_AUTHOR_EMAIL: "test@example.com",
        GIT_COMMITTER_NAME: "Test User",
        GIT_COMMITTER_EMAIL: "test@example.com",
      },
    });
  }

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "repomemory-recentdiff-test-"));
    gitCmd(["init", "-b", "main"]);
    writeFileSync(join(tempDir, "test.txt"), "content\n");
    gitCmd(["add", "."]);
    gitCmd(["commit", "-m", "Initial"]);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns recent diff output as a string", () => {
    const diffs = getRecentDiffs(tempDir, 10);
    expect(typeof diffs).toBe("string");
    expect(diffs).toContain("Initial");
  });

  it("returns empty string for non-git directory", () => {
    const nonGitDir = mkdtempSync(join(tmpdir(), "repomemory-nongit3-"));
    try {
      const diffs = getRecentDiffs(nonGitDir, 10);
      expect(diffs).toBe("");
    } finally {
      rmSync(nonGitDir, { recursive: true, force: true });
    }
  });
});
