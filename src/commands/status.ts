import chalk from "chalk";
import { loadConfig } from "../lib/config.js";
import { ContextStore } from "../lib/context-store.js";

export async function statusCommand(options: { dir?: string }) {
  const repoRoot = options.dir || process.cwd();
  const config = loadConfig(repoRoot);
  const store = new ContextStore(repoRoot, config);

  if (!store.exists()) {
    console.log(chalk.red("\u2717 No .context/ directory found."));
    console.log(chalk.dim("  Run `repomemory init` to get started."));
    process.exit(1);
  }

  const stats = store.getStats();
  const entries = store.listEntries();

  console.log(chalk.bold("\n\ud83d\udcca repomemory status\n"));
  console.log(`  ${chalk.cyan("Total files:")} ${stats.totalFiles}`);
  console.log(`  ${chalk.cyan("Total size:")} ${(stats.totalSize / 1024).toFixed(1)}KB`);
  console.log(`  ${chalk.cyan("Provider:")} ${config.provider} (${config.model})`);

  // Freshness info
  if (stats.newestFile) {
    console.log(`  ${chalk.cyan("Last updated:")} ${formatAge(stats.newestFile.age)} (${stats.newestFile.path})`);
  }
  if (stats.stalestFile && stats.stalestFile.age > 30 * 24 * 60 * 60 * 1000) {
    console.log(
      `  ${chalk.yellow("\u26a0 Stalest file:")} ${formatAge(stats.stalestFile.age)} (${stats.stalestFile.path})`
    );
  }

  console.log();

  // Category breakdown with visual bars
  const maxCount = Math.max(...Object.values(stats.categories).map(Number), 1);

  for (const [category, count] of Object.entries(stats.categories)) {
    const barLength = 15;
    const filled = Math.round((count / maxCount) * barLength);
    const bar = chalk.cyan("\u2588".repeat(filled)) + chalk.dim("\u2591".repeat(barLength - filled));
    const label = (category + "/").padEnd(14);

    console.log(`  ${chalk.bold(label)} ${bar} ${count} files`);

    const catEntries = entries.filter((e) => e.category === category);
    for (const entry of catEntries) {
      const sizeKb = (entry.sizeBytes / 1024).toFixed(1);
      const age = formatAge(Date.now() - entry.lastModified.getTime());
      const staleMarker = isStale(entry.lastModified) ? chalk.yellow(" (stale)") : "";
      console.log(
        `    ${chalk.dim("\u2022")} ${entry.filename} \u2014 ${entry.title} (${sizeKb}KB, ${age})${staleMarker}`
      );
    }
    console.log();
  }

  // Coverage assessment
  const factsCount = stats.categories["facts"] || 0;
  const decisionsCount = stats.categories["decisions"] || 0;
  const regressionsCount = stats.categories["regressions"] || 0;
  const sessionsCount = stats.categories["sessions"] || 0;
  const preferencesCount = stats.categories["preferences"] || 0;

  const suggestions: string[] = [];
  if (factsCount === 0) suggestions.push("Run `repomemory analyze` to generate architecture facts");
  if (decisionsCount === 0) suggestions.push("Document key architectural decisions in decisions/");
  if (regressionsCount === 0) suggestions.push("Record known gotchas in regressions/ to prevent repeat bugs");
  if (sessionsCount === 0) suggestions.push("AI agents can use context_write to record session summaries");
  if (preferencesCount === 0)
    suggestions.push("Record coding preferences in preferences/ — helps agents match your style");

  if (stats.stalestFile && stats.stalestFile.age > 90 * 24 * 60 * 60 * 1000) {
    suggestions.push("Some context files are >90 days old \u2014 run `repomemory analyze --merge` to refresh");
  }

  if (suggestions.length > 0) {
    console.log(chalk.bold("  Suggestions:"));
    for (const suggestion of suggestions) {
      console.log(`    ${chalk.yellow("\u2192")} ${suggestion}`);
    }
    console.log();
  }
}

function formatAge(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  const days = Math.floor(seconds / 86400);
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function isStale(date: Date): boolean {
  return Date.now() - date.getTime() > 60 * 24 * 60 * 60 * 1000; // 60 days
}
