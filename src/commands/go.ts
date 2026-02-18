import { existsSync, readFileSync } from "fs";
import { join } from "path";
import chalk from "chalk";
import { loadConfig, resolveGlobalDir } from "../lib/config.js";
import type { Provider } from "../lib/config.js";
import { ContextStore } from "../lib/context-store.js";
import { validateApiKey } from "../lib/ai-provider.js";
import { CLAUDE_MD_BLOCK, STARTER_INDEX, writeDefaultConfigFile } from "./init.js";
import { analyzeCommand } from "./analyze.js";
import { setupCommand } from "./setup.js";

export async function goCommand(options: {
  dir?: string;
  provider?: string;
  embeddingProvider?: string;
  skipAnalyze?: boolean;
}) {
  const repoRoot = options.dir || process.cwd();
  const config = loadConfig(repoRoot);

  if (options.provider) {
    const validProviders: Provider[] = ["anthropic", "openai", "gemini", "grok"];
    if (!validProviders.includes(options.provider as Provider)) {
      console.log(chalk.red(`Invalid provider "${options.provider}". Must be one of: ${validProviders.join(", ")}`));
      process.exit(1);
    }
    config.provider = options.provider as Provider;
  }

  const store = new ContextStore(repoRoot, config);
  const steps: string[] = [];
  let totalSteps = 5;
  let currentStep = 0;

  console.log(chalk.bold("\nrepomemory go \u2014 one-command setup\n"));

  // Step 0: Ensure global context exists
  currentStep++;
  if (config.enableGlobalContext) {
    const globalDir = resolveGlobalDir(config);
    const globalStore = ContextStore.forAbsolutePath(globalDir);
    if (!globalStore.exists()) {
      console.log(chalk.cyan(`${currentStep}/${totalSteps}`) + " Setting up global developer profile...");
      globalStore.scaffold();
      steps.push(`Created ${globalDir} for developer preferences`);
    } else {
      const globalPrefs = globalStore.listEntries("preferences");
      console.log(chalk.dim(`${currentStep}/${totalSteps} Global profile loaded (${globalPrefs.length} preference${globalPrefs.length !== 1 ? "s" : ""}).`));
    }
  } else {
    console.log(chalk.dim(`${currentStep}/${totalSteps} Global context disabled.`));
  }

  // Step 1: Create .context/ if missing
  currentStep++;
  if (!store.exists()) {
    console.log(chalk.cyan(`${currentStep}/${totalSteps}`) + " Initializing .context/ directory...");
    store.scaffold();
    store.writeIndex(STARTER_INDEX);
    writeDefaultConfigFile(repoRoot, config.provider, config.model, options.embeddingProvider);

    // Show embedding status
    const embeddingLabel = options.embeddingProvider
      ? options.embeddingProvider
      : (process.env.OPENAI_API_KEY ? "openai (auto-detected)"
        : (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) ? "gemini (auto-detected)"
        : "none (keyword search only)");
    steps.push(`Initialized .context/ directory (embeddings: ${embeddingLabel})`);
  } else {
    console.log(chalk.dim(`${currentStep}/${totalSteps} .context/ already exists. Skipping init.`));
  }

  // Step 2: Configure Claude Code if possible
  currentStep++;
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const claudeConfigPath = join(homeDir, ".claude.json");
  let claudeConfigured = false;

  if (homeDir) {
    try {
      let cfg: Record<string, unknown> = {};
      if (existsSync(claudeConfigPath)) {
        cfg = JSON.parse(readFileSync(claudeConfigPath, "utf-8"));
      }
      const servers = (cfg.mcpServers || {}) as Record<string, unknown>;
      if (!servers["repomemory"]) {
        console.log(chalk.cyan(`${currentStep}/${totalSteps}`) + " Adding MCP server to Claude Code...");
        try {
          await setupCommand("claude", { dir: repoRoot });
          steps.push("Configured Claude Code MCP server");
          claudeConfigured = true;
        } catch {
          console.log(chalk.yellow(`  Warning: Failed to configure Claude Code. Run manually: npx repomemory setup claude`));
        }
      } else {
        console.log(chalk.dim(`${currentStep}/${totalSteps} Claude Code already configured. Skipping.`));
        claudeConfigured = true;
      }
    } catch {
      console.log(chalk.dim(`${currentStep}/${totalSteps} Could not configure Claude Code. Skipping.`));
    }
  } else {
    console.log(chalk.dim(`${currentStep}/${totalSteps} Could not detect home directory. Skipping Claude setup.`));
  }

  // Step 3: Run analyze if context is mostly empty
  currentStep++;
  const entries = store.exists() ? store.listEntries() : [];
  const factsCount = entries.filter((e) => e.category === "facts").length;
  const needsAnalysis = factsCount === 0 && !options.skipAnalyze;

  if (needsAnalysis) {
    const hasKey = await validateApiKey(config);
    if (hasKey) {
      console.log(chalk.cyan(`${currentStep}/${totalSteps}`) + " Analyzing repository...");
      try {
        await analyzeCommand({
          dir: repoRoot,
          provider: config.provider,
          model: config.model,
          verbose: false,
          dryRun: false,
          merge: false,
        });
        steps.push("Analyzed repository with AI");
      } catch {
        console.log(chalk.yellow("  Warning: Analysis failed. You can run it manually: npx repomemory analyze"));
      }
    } else {
      console.log(chalk.yellow(`${currentStep}/${totalSteps} No API key found. Skipping analysis.`));
      console.log(chalk.dim("  Set your API key and run: npx repomemory analyze"));
    }
  } else if (options.skipAnalyze) {
    console.log(chalk.dim(`${currentStep}/${totalSteps} Analysis skipped (--skip-analyze).`));
  } else {
    console.log(chalk.dim(`${currentStep}/${totalSteps} Context already populated. Skipping analysis.`));
  }

  // Step 4: Print CLAUDE.md block
  currentStep++;
  console.log(chalk.cyan(`\n${currentStep}/${totalSteps}`) + ` Add this to your ${chalk.bold("CLAUDE.md")}:\n`);
  console.log(chalk.cyan("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 copy below into CLAUDE.md \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));
  console.log();
  console.log(CLAUDE_MD_BLOCK);
  console.log();
  console.log(chalk.cyan("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"));

  // Summary
  console.log(chalk.bold("\n\u2713 Done!\n"));
  if (steps.length > 0) {
    for (const step of steps) {
      console.log(`  ${chalk.green("\u25b6")} ${step}`);
    }
  } else {
    console.log(chalk.dim("  Everything was already set up."));
  }

  if (!claudeConfigured) {
    console.log(chalk.dim("\n  To connect other tools: npx repomemory setup <cursor|copilot|windsurf|cline|aider|continue>"));
  }

  console.log(chalk.dim("\n  Commit to git: git add .context/ .repomemory.json && git commit -m \"Add repomemory\""));
  console.log();
}
