import chalk from "chalk";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { loadConfig } from "../lib/config.js";
import { ContextStore } from "../lib/context-store.js";
import { SearchIndex } from "../lib/search.js";
import { getGitDiffSummary } from "../lib/git.js";

export async function syncCommand(options: {
  dir?: string;
  since?: string;
}) {
  const repoRoot = options.dir || process.cwd();
  const config = loadConfig(repoRoot);
  const store = new ContextStore(repoRoot, config);

  if (!store.exists()) {
    console.log(chalk.red("✗ No .context/ directory found. Run `repomemory init` first."));
    process.exit(1);
  }

  // Determine sync period
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Check last sync timestamp
  const syncFile = join(store.path, ".last-sync");
  let lastSync = options.since || "";

  if (!lastSync && existsSync(syncFile)) {
    lastSync = readFileSync(syncFile, "utf-8").trim();
  }

  if (!lastSync) {
    // Default to 30 days ago
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    lastSync = thirtyDaysAgo.toISOString().split("T")[0];
  }

  console.log(chalk.bold(`\n📅 Syncing git history since ${lastSync}...\n`));

  const commits = getGitDiffSummary(repoRoot, lastSync);

  if (!commits.trim()) {
    console.log(chalk.dim("  No new commits since last sync."));
    return;
  }

  const commitLines = commits.split("\n").filter(Boolean);
  console.log(`  ${chalk.cyan("New commits:")} ${commitLines.length}`);

  // Build changelog entry
  const changelogContent = [
    `# Changelog — ${yearMonth}`,
    "",
    `*Synced: ${now.toISOString().split("T")[0]}*`,
    "",
    "## Commits",
    "",
    ...commitLines.map((line) => `- ${line}`),
    "",
  ].join("\n");

  // Write or append to monthly changelog
  const changelogFile = `${yearMonth}.md`;
  const existingChangelog = store.readEntry("changelog", changelogFile);

  if (existingChangelog) {
    // Append new commits section
    const appendContent = [
      "",
      `## Synced ${now.toISOString().split("T")[0]}`,
      "",
      ...commitLines.map((line) => `- ${line}`),
      "",
    ].join("\n");
    store.appendEntry("changelog", changelogFile, appendContent);
    console.log(`  ${chalk.green("✓")} Appended to changelog/${changelogFile}`);
  } else {
    store.writeEntry("changelog", changelogFile, changelogContent);
    console.log(`  ${chalk.green("✓")} Created changelog/${changelogFile}`);
  }

  // Update last sync timestamp
  writeFileSync(syncFile, now.toISOString().split("T")[0]);

  // Rebuild search index
  const searchIndex = new SearchIndex(store.path, store);
  searchIndex.rebuild();
  searchIndex.close();
  console.log(`  ${chalk.green("✓")} Search index updated`);

  console.log(chalk.bold("\n✨ Sync complete!\n"));
}
