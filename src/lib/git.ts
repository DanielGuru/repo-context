import { execFileSync } from "child_process";

export interface GitCommit {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  message: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
}

export interface GitInfo {
  isGitRepo: boolean;
  currentBranch: string;
  defaultBranch: string;
  remoteUrl: string;
  totalCommits: number;
  contributors: { name: string; commits: number }[];
  recentCommits: GitCommit[];
  activeBranches: string[];
  lastTagOrRelease: string;
  commitFrequency: string;
}

function git(args: string[], cwd: string): string {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf-8",
      timeout: 30_000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
}

export function getGitInfo(repoRoot: string, maxCommits: number): GitInfo {
  const isGitRepo = git(["rev-parse", "--is-inside-work-tree"], repoRoot) === "true";

  if (!isGitRepo) {
    return {
      isGitRepo: false,
      currentBranch: "",
      defaultBranch: "",
      remoteUrl: "",
      totalCommits: 0,
      contributors: [],
      recentCommits: [],
      activeBranches: [],
      lastTagOrRelease: "",
      commitFrequency: "",
    };
  }

  const currentBranch = git(["branch", "--show-current"], repoRoot);

  // Detect default branch
  let defaultBranch = git(["symbolic-ref", "refs/remotes/origin/HEAD", "--short"], repoRoot).replace(/^origin\//, "");

  if (!defaultBranch) {
    const branches = git(["branch", "-a"], repoRoot);
    const branchList = branches.split("\n").map((b) => b.trim().replace(/^\* /, ""));
    if (branchList.some((b) => b === "main" || b === "origin/main")) defaultBranch = "main";
    else if (branchList.some((b) => b === "master" || b === "origin/master")) defaultBranch = "master";
    else defaultBranch = currentBranch;
  }

  const remoteUrl = git(["remote", "get-url", "origin"], repoRoot);
  const totalCommitsStr = git(["rev-list", "--count", "HEAD"], repoRoot);
  const totalCommits = parseInt(totalCommitsStr) || 0;

  // Contributors (limit to 20 in JS, not with head)
  const contributorLines = git(["shortlog", "-sn", "--no-merges", "HEAD"], repoRoot);
  const contributors = contributorLines
    .split("\n")
    .filter(Boolean)
    .slice(0, 20)
    .map((line) => {
      const match = line.trim().match(/^(\d+)\s+(.+)$/);
      return match ? { name: match[2], commits: parseInt(match[1]) } : { name: line.trim(), commits: 0 };
    });

  // Recent commits with stats
  const commitLog = git(
    ["log", `--format=%H%x00%h%x00%an%x00%ai%x00%s`, "--shortstat", "-n", String(maxCommits)],
    repoRoot
  );

  const recentCommits: GitCommit[] = [];
  const lines = commitLog.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line || !line.includes("\0")) {
      i++;
      continue;
    }

    const parts = line.split("\0");
    if (parts.length < 5) {
      i++;
      continue;
    }

    let filesChanged = 0,
      insertions = 0,
      deletions = 0;

    let j = i + 1;
    while (j < lines.length && lines[j] === "") j++;
    if (j < lines.length && lines[j].includes("file")) {
      const statsLine = lines[j];
      const filesMatch = statsLine.match(/(\d+) files? changed/);
      const insMatch = statsLine.match(/(\d+) insertions?\(\+\)/);
      const delMatch = statsLine.match(/(\d+) deletions?\(-\)/);
      if (filesMatch) filesChanged = parseInt(filesMatch[1]);
      if (insMatch) insertions = parseInt(insMatch[1]);
      if (delMatch) deletions = parseInt(delMatch[1]);
      i = j + 1;
    } else {
      i = j;
    }

    recentCommits.push({
      hash: parts[0],
      shortHash: parts[1],
      author: parts[2],
      date: parts[3],
      message: parts.slice(4).join("\0"),
      filesChanged,
      insertions,
      deletions,
    });
  }

  // Active branches (limit in JS)
  const branchOutput = git(["branch", "-a", "--sort=-committerdate", "--format=%(refname:short)"], repoRoot);
  const activeBranches = branchOutput.split("\n").filter(Boolean).slice(0, 15);

  // Last tag
  const lastTagOrRelease = git(["describe", "--tags", "--abbrev=0"], repoRoot);

  // Commit frequency
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const recentCount = git(["rev-list", "--count", `--after=${thirtyDaysAgo}`, "HEAD"], repoRoot);
  const commitsPerMonth = parseInt(recentCount) || 0;
  let commitFrequency = "inactive";
  if (commitsPerMonth > 100) commitFrequency = "very active (100+/month)";
  else if (commitsPerMonth > 30) commitFrequency = "active (30+/month)";
  else if (commitsPerMonth > 10) commitFrequency = "moderate (10-30/month)";
  else if (commitsPerMonth > 0) commitFrequency = "low (<10/month)";

  return {
    isGitRepo,
    currentBranch,
    defaultBranch,
    remoteUrl,
    totalCommits,
    contributors,
    recentCommits,
    activeBranches,
    lastTagOrRelease,
    commitFrequency,
  };
}

export function getGitDiffSummary(repoRoot: string, since: string): string {
  return git(["log", `--since=${since}`, "--format=%h %s (%an, %ar)", "--no-merges"], repoRoot);
}

export function getRecentDiffs(repoRoot: string, count: number): string {
  return git(["log", `-${count}`, "--no-merges", "--format=--- %h: %s ---", "--stat"], repoRoot);
}

export function getLastCommitHash(repoRoot: string): string {
  return git(["rev-parse", "HEAD"], repoRoot);
}
