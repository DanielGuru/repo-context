import chalk from "chalk";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { loadConfig } from "../lib/config.js";
import { ContextStore } from "../lib/context-store.js";
import { SearchIndex } from "../lib/search.js";
import { getGitDiffSummary, getLastCommitHash } from "../lib/git.js";

export async function syncCommand(options: { dir?: string; since?: string }) {
  const repoRoot = options.dir || process.cwd();
  const config = loadConfig(repoRoot);
  const store = new ContextStore(repoRoot, config);

  if (!store.exists()) {
    console.log(chalk.red("\u2717 No .context/ directory found. Run `repomemory init` first."));
    process.exit(1);
  }

  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Track last sync with both date and commit hash for deduplication
  const syncFile = join(store.path, ".last-sync");
  const hashFile = join(store.path, ".last-sync-hash");

  let lastSync = options.since || "";
  let lastHash = "";

  if (!lastSync && existsSync(syncFile)) {
    lastSync = readFileSync(syncFile, "utf-8").trim();
  }

  if (existsSync(hashFile)) {
    lastHash = readFileSync(hashFile, "utf-8").trim();
  }

  if (!lastSync) {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    lastSync = thirtyDaysAgo.toISOString().split("T")[0];
  }

  // Get current HEAD hash
  const currentHash = getLastCommitHash(repoRoot);

  // Skip if no new commits since last sync
  if (lastHash && currentHash && lastHash === currentHash) {
    console.log(chalk.dim("\n  Already up to date. No new commits since last sync."));
    return;
  }

  console.log(chalk.bold(`\n\ud83d\udcc5 Syncing git history since ${lastSync}...\n`));

  const commits = getGitDiffSummary(repoRoot, lastSync);

  if (!commits.trim()) {
    console.log(chalk.dim("  No new commits since last sync."));
    // Still update the hash
    if (currentHash) {
      writeFileSync(hashFile, currentHash);
    }
    return;
  }

  const commitLines = commits.split("\n").filter(Boolean);

  // Deduplicate: if we have an existing changelog, filter out commits we already recorded
  const changelogFile = `${yearMonth}.md`;
  const existingChangelog = store.readEntry("changelog", changelogFile);
  let newCommitLines = commitLines;

  if (existingChangelog) {
    const existingHashes = new Set([...existingChangelog.matchAll(/^([a-f0-9]{7,40})\s/gm)].map((m) => m[1]));
    newCommitLines = commitLines.filter((line) => {
      const hashMatch = line.match(/^([a-f0-9]{7,})\s/);
      return !hashMatch || !existingHashes.has(hashMatch[1]);
    });
  }

  if (newCommitLines.length === 0) {
    console.log(chalk.dim("  All commits already recorded."));
    writeFileSync(syncFile, now.toISOString().split("T")[0]);
    if (currentHash) writeFileSync(hashFile, currentHash);
    return;
  }

  console.log(`  ${chalk.cyan("New commits:")} ${newCommitLines.length}`);

  if (existingChangelog) {
    const appendContent = [
      "",
      `## Synced ${now.toISOString().split("T")[0]}`,
      "",
      ...newCommitLines.map((line) => `- ${line}`),
      "",
    ].join("\n");
    store.appendEntry("changelog", changelogFile, appendContent);
    console.log(`  ${chalk.green("\u2713")} Appended to changelog/${changelogFile}`);
  } else {
    const changelogContent = [
      `# Changelog \u2014 ${yearMonth}`,
      "",
      `*Synced: ${now.toISOString().split("T")[0]}*`,
      "",
      "## Commits",
      "",
      ...newCommitLines.map((line) => `- ${line}`),
      "",
    ].join("\n");
    store.writeEntry("changelog", changelogFile, changelogContent);
    console.log(`  ${chalk.green("\u2713")} Created changelog/${changelogFile}`);
  }

  // Update sync markers
  writeFileSync(syncFile, now.toISOString().split("T")[0]);
  if (currentHash) {
    writeFileSync(hashFile, currentHash);
  }

  // Rebuild search index
  const searchIndex = new SearchIndex(store.path, store);
  await searchIndex.rebuild();
  searchIndex.close();
  console.log(`  ${chalk.green("\u2713")} Search index updated`);

  console.log(chalk.bold("\n\u2728 Sync complete!\n"));
}
