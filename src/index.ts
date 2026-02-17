#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { analyzeCommand } from "./commands/analyze.js";
import { syncCommand } from "./commands/sync.js";
import { serveCommand } from "./commands/serve.js";
import { setupCommand } from "./commands/setup.js";

const program = new Command();

program
  .name("repo-context")
  .description(
    "Persistent, structured memory for AI coding agents. Your repo remembers what every session learned."
  )
  .version("0.1.0");

program
  .command("init")
  .description("Initialize .context/ directory in the current repo")
  .option("-d, --dir <path>", "Repository root directory", process.cwd())
  .option(
    "-p, --provider <provider>",
    "AI provider (anthropic, openai, gemini, grok)",
    "anthropic"
  )
  .action(initCommand);

program
  .command("analyze")
  .description(
    "Analyze the repository with AI and populate .context/ with structured knowledge"
  )
  .option("-d, --dir <path>", "Repository root directory", process.cwd())
  .option(
    "-p, --provider <provider>",
    "AI provider (anthropic, openai, gemini, grok)"
  )
  .option("-m, --model <model>", "Model to use (provider-specific)")
  .option("-v, --verbose", "Show detailed output", false)
  .action(analyzeCommand);

program
  .command("sync")
  .description("Sync recent git history into .context/changelog/")
  .option("-d, --dir <path>", "Repository root directory", process.cwd())
  .option("-s, --since <date>", "Sync commits since this date (YYYY-MM-DD)")
  .action(syncCommand);

program
  .command("serve")
  .description("Start the MCP server for AI agent integration")
  .option("-d, --dir <path>", "Repository root directory", process.cwd())
  .action(serveCommand);

program
  .command("setup <tool>")
  .description(
    "Configure AI tool integration (claude, cursor, copilot)"
  )
  .option("-d, --dir <path>", "Repository root directory", process.cwd())
  .action(setupCommand);

program
  .command("status")
  .description("Show the current state of .context/")
  .option("-d, --dir <path>", "Repository root directory", process.cwd())
  .action(async (options) => {
    const { default: chalk } = await import("chalk");
    const { loadConfig } = await import("./lib/config.js");
    const { ContextStore } = await import("./lib/context-store.js");

    const repoRoot = options.dir || process.cwd();
    const config = loadConfig(repoRoot);
    const store = new ContextStore(repoRoot, config);

    if (!store.exists()) {
      console.log(chalk.red("✗ No .context/ directory found."));
      console.log(chalk.dim("  Run `repo-context init` to get started."));
      process.exit(1);
    }

    const stats = store.getStats();
    const entries = store.listEntries();

    console.log(chalk.bold("\n📊 repo-context status\n"));
    console.log(`  ${chalk.cyan("Total files:")} ${stats.totalFiles}`);
    console.log(
      `  ${chalk.cyan("Total size:")} ${(stats.totalSize / 1024).toFixed(1)}KB`
    );
    console.log();

    for (const [category, count] of Object.entries(stats.categories)) {
      console.log(`  ${chalk.bold(category + "/")} (${count} files)`);
      const catEntries = entries.filter((e) => e.category === category);
      for (const entry of catEntries) {
        const sizeKb = (entry.sizeBytes / 1024).toFixed(1);
        console.log(`    ${chalk.dim("•")} ${entry.filename} — ${entry.title} (${sizeKb}KB)`);
      }
    }

    console.log();
    console.log(
      chalk.dim(
        `  Provider: ${config.provider} | Model: ${config.model}`
      )
    );
  });

program.parse();
