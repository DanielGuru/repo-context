import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import chalk from "chalk";
import * as p from "@clack/prompts";
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
  model?: string;
  embeddingProvider?: string;
  skipAnalyze?: boolean;
}) {
  const repoRoot = options.dir || process.cwd();
  const config = loadConfig(repoRoot);
  const configPath = join(repoRoot, ".repomemory.json");

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
  const totalSteps = 5;
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

  // Step 1: Configure — ask about key settings if not provided via flags
  currentStep++;
  const isNewSetup = !existsSync(configPath);

  // Determine embedding provider
  let embeddingProvider = options.embeddingProvider || config.embeddingProvider;
  if (!embeddingProvider) {
    // Detect available keys
    const embeddingKeys: { provider: string; label: string }[] = [];
    if (process.env.OPENAI_API_KEY) {
      embeddingKeys.push({ provider: "openai", label: "OpenAI (text-embedding-3-small)" });
    }
    if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      embeddingKeys.push({ provider: "gemini", label: "Gemini (text-embedding-004)" });
    }

    if (embeddingKeys.length > 0) {
      const embeddingChoice = await p.select({
        message: "Embedding provider for semantic search?",
        options: [
          ...embeddingKeys.map((k) => ({ value: k.provider, label: k.label })),
          { value: "none", label: "None", hint: "Keyword search only \u2014 no API costs" },
        ],
      });

      if (p.isCancel(embeddingChoice)) {
        p.cancel("Setup cancelled.");
        process.exit(0);
      }

      embeddingProvider = embeddingChoice === "none" ? undefined : (embeddingChoice as string);
    } else {
      console.log(chalk.dim(`${currentStep}/${totalSteps} No embedding API keys found. Using keyword search.`));
      console.log(chalk.dim("  Set OPENAI_API_KEY or GEMINI_API_KEY to enable semantic search."));
    }
  }

  // Determine max files for analysis
  let maxFiles = config.maxFilesForAnalysis;
  if (isNewSetup) {
    const maxFilesChoice = await p.select({
      message: `Max files to analyze? (your repo has many files)`,
      options: [
        { value: "80", label: "80 (default)", hint: "Fast, covers key files" },
        { value: "150", label: "150", hint: "Good for medium repos" },
        { value: "300", label: "300", hint: "Thorough, slower analysis" },
      ],
    });

    if (p.isCancel(maxFilesChoice)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    maxFiles = parseInt(maxFilesChoice as string, 10);
  }

  // Write or update config
  if (isNewSetup) {
    console.log(chalk.cyan(`${currentStep}/${totalSteps}`) + " Initializing .context/ directory...");
    store.scaffold();
    store.writeIndex(STARTER_INDEX);

    const configToWrite: Record<string, unknown> = {
      provider: config.provider,
      model: options.model || config.model,
      contextDir: config.contextDir,
      maxFilesForAnalysis: maxFiles,
      maxGitCommits: config.maxGitCommits,
      autoIndex: config.autoIndex,
      ignorePatterns: [] as string[],
      keyFilePatterns: [] as string[],
    };
    if (embeddingProvider) {
      configToWrite.embeddingProvider = embeddingProvider;
    }
    writeFileSync(configPath, JSON.stringify(configToWrite, null, 2) + "\n");

    const embeddingLabel = embeddingProvider || "none (keyword only)";
    steps.push(`Initialized .context/ (embeddings: ${embeddingLabel}, maxFiles: ${maxFiles})`);
  } else {
    // Update existing config if new settings were chosen
    let updated = false;
    let existingConfig: Record<string, unknown> = {};
    try {
      existingConfig = JSON.parse(readFileSync(configPath, "utf-8"));
    } catch {
      existingConfig = {};
    }

    if (embeddingProvider && !existingConfig.embeddingProvider) {
      existingConfig.embeddingProvider = embeddingProvider;
      updated = true;
    }
    if (maxFiles !== config.maxFilesForAnalysis) {
      existingConfig.maxFilesForAnalysis = maxFiles;
      updated = true;
    }

    if (updated) {
      writeFileSync(configPath, JSON.stringify(existingConfig, null, 2) + "\n");
      steps.push(`Updated .repomemory.json (embeddings: ${embeddingProvider || "unchanged"}, maxFiles: ${maxFiles})`);
    }

    if (!store.exists()) {
      store.scaffold();
      store.writeIndex(STARTER_INDEX);
      steps.push("Initialized .context/ directory");
    } else {
      console.log(chalk.dim(`${currentStep}/${totalSteps} .context/ already exists.`));
    }
  }

  // Update in-memory config for analysis
  config.maxFilesForAnalysis = maxFiles;
  if (embeddingProvider) {
    config.embeddingProvider = embeddingProvider as "openai" | "gemini";
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
          steps.push("Configured Claude Code MCP server + post-commit hook");
          claudeConfigured = true;
        } catch {
          console.log(chalk.yellow(`  Warning: Failed to configure Claude Code. Run manually: npx repomemory setup claude`));
        }
      } else {
        console.log(chalk.dim(`${currentStep}/${totalSteps} Claude Code already configured.`));
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
