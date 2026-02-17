import { execSync } from "child_process";

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

function exec(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { cwd, encoding: "utf-8", timeout: 30_000 }).trim();
  } catch {
    return "";
  }
}

export function getGitInfo(repoRoot: string, maxCommits: number): GitInfo {
  const isGitRepo = exec("git rev-parse --is-inside-work-tree", repoRoot) === "true";

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

  const currentBranch = exec("git branch --show-current", repoRoot);

  // Detect default branch
  let defaultBranch = exec(
    "git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@'",
    repoRoot
  );
  if (!defaultBranch) {
    const branches = exec("git branch -a", repoRoot);
    if (branches.includes("main")) defaultBranch = "main";
    else if (branches.includes("master")) defaultBranch = "master";
    else defaultBranch = currentBranch;
  }

  const remoteUrl = exec("git remote get-url origin 2>/dev/null", repoRoot);
  const totalCommitsStr = exec("git rev-list --count HEAD 2>/dev/null", repoRoot);
  const totalCommits = parseInt(totalCommitsStr) || 0;

  // Contributors
  const contributorLines = exec(
    "git shortlog -sn --no-merges HEAD 2>/dev/null | head -20",
    repoRoot
  );
  const contributors = contributorLines
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const match = line.trim().match(/^(\d+)\s+(.+)$/);
      return match
        ? { name: match[2], commits: parseInt(match[1]) }
        : { name: line.trim(), commits: 0 };
    });

  // Recent commits with stats
  const commitLog = exec(
    `git log --format="%H|%h|%an|%ai|%s" --shortstat -n ${maxCommits} 2>/dev/null`,
    repoRoot
  );

  const recentCommits: GitCommit[] = [];
  const lines = commitLog.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line || !line.includes("|")) {
      i++;
      continue;
    }

    const parts = line.split("|");
    if (parts.length < 5) {
      i++;
      continue;
    }

    let filesChanged = 0,
      insertions = 0,
      deletions = 0;

    // Check next non-empty line for stats
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
      message: parts.slice(4).join("|"),
      filesChanged,
      insertions,
      deletions,
    });
  }

  // Active branches
  const branchOutput = exec(
    'git branch -a --sort=-committerdate --format="%(refname:short)" 2>/dev/null | head -15',
    repoRoot
  );
  const activeBranches = branchOutput.split("\n").filter(Boolean);

  // Last tag
  const lastTagOrRelease = exec("git describe --tags --abbrev=0 2>/dev/null", repoRoot);

  // Commit frequency
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const recentCount = exec(
    `git rev-list --count --after="${thirtyDaysAgo}" HEAD 2>/dev/null`,
    repoRoot
  );
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
  return exec(
    `git log --since="${since}" --format="%h %s (%an, %ar)" --no-merges 2>/dev/null`,
    repoRoot
  );
}

export function getRecentDiffs(repoRoot: string, count: number): string {
  return exec(
    `git log -${count} --no-merges --format="--- %h: %s ---" --stat 2>/dev/null`,
    repoRoot
  );
}
