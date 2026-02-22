import chalk from "chalk";
import * as p from "@clack/prompts";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { loadConfig } from "../lib/config.js";
import type { Provider } from "../lib/config.js";
import { ContextStore } from "../lib/context-store.js";
import { STARTER_INDEX, writeDefaultConfigFile } from "./init.js";
import { analyzeCommand } from "./analyze.js";
import { setupCommand } from "./setup.js";

const PROVIDER_INFO: Record<string, { envVar: string; label: string; hint: string }> = {
  anthropic: {
    envVar: "ANTHROPIC_API_KEY",
    label: "Anthropic (Claude)",
    hint: "Best quality. Recommended.",
  },
  openai: {
    envVar: "OPENAI_API_KEY",
    label: "OpenAI (GPT-4o)",
    hint: "Fast and reliable.",
  },
  gemini: {
    envVar: "GEMINI_API_KEY",
    label: "Google (Gemini)",
    hint: "Cheapest option.",
  },
  grok: {
    envVar: "GROK_API_KEY",
    label: "xAI (Grok)",
    hint: "OpenAI-compatible.",
  },
};

const SUPPORTED_TOOLS = ["claude", "cursor", "copilot", "windsurf", "cline", "aider", "continue"] as const;

type ToolName = (typeof SUPPORTED_TOOLS)[number];

function detectProviders(): string[] {
  const detected: string[] = [];
  for (const [provider, info] of Object.entries(PROVIDER_INFO)) {
    if (process.env[info.envVar]) {
      detected.push(provider);
    }
  }
  if (!detected.includes("gemini") && (process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY)) {
    detected.push("gemini");
  }
  if (!detected.includes("grok") && process.env.XAI_API_KEY) {
    detected.push("grok");
  }
  return detected;
}

function detectEmbeddingProviders(): Array<{ provider: string; label: string }> {
  const providers: Array<{ provider: string; label: string }> = [];
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    providers.push({ provider: "gemini", label: "Gemini (text-embedding-004)" });
  }
  if (process.env.OPENAI_API_KEY) {
    providers.push({ provider: "openai", label: "OpenAI (text-embedding-3-small)" });
  }
  return providers;
}

function parseTools(value: string | undefined): ToolName[] {
  if (!value) return ["claude"];
  const tools = value
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  const invalid = tools.filter((t) => !SUPPORTED_TOOLS.includes(t as ToolName));
  if (invalid.length > 0) {
    throw new Error(`Unknown tools: ${invalid.join(", ")}. Supported: ${SUPPORTED_TOOLS.join(", ")}`);
  }

  return [...new Set(tools)] as ToolName[];
}

export async function wizardCommand(options: {
  dir?: string;
  yes?: boolean;
  defaults?: boolean;
  noPrompt?: boolean;
  provider?: string;
  embeddingProvider?: string;
  maxFiles?: string;
  tools?: string;
  skipAnalyze?: boolean;
}) {
  const repoRoot = options.dir || process.cwd();
  const useDefaults = Boolean(options.yes || options.defaults);
  const noPrompt = Boolean(options.noPrompt || useDefaults);
  const interactive = process.stdin.isTTY && process.stdout.isTTY && !noPrompt;

  const requestedMaxFiles = options.maxFiles ? parseInt(options.maxFiles, 10) : undefined;
  if (options.maxFiles && (!Number.isFinite(requestedMaxFiles) || (requestedMaxFiles ?? 0) <= 0)) {
    console.log(chalk.red(`Invalid --max-files value "${options.maxFiles}". Must be a positive integer.`));
    process.exit(1);
  }

  if (options.provider) {
    const validProviders: Provider[] = ["anthropic", "openai", "gemini", "grok"];
    if (!validProviders.includes(options.provider as Provider)) {
      console.log(chalk.red(`Invalid provider "${options.provider}". Must be one of: ${validProviders.join(", ")}`));
      process.exit(1);
    }
  }

  let requestedTools: ToolName[];
  try {
    requestedTools = parseTools(options.tools);
  } catch (err) {
    console.log(chalk.red((err as Error).message));
    process.exit(1);
  }

  if (interactive) {
    p.intro(chalk.bgCyan.black(" repomemory ") + chalk.dim(" Your codebase never forgets."));
  } else {
    console.log(chalk.bold("\nrepomemory wizard \u2014 non-interactive setup\n"));
  }

  // Step 1: Check if already initialized
  const contextExists = existsSync(join(repoRoot, ".context"));
  if (contextExists && interactive) {
    const overwrite = await p.confirm({
      message: ".context/ already exists. Re-analyze and refresh?",
      initialValue: false,
    });

    if (p.isCancel(overwrite)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    if (!overwrite) {
      p.cancel("Keeping existing context.");
      process.exit(0);
    }
  }

  // Step 2: Provider
  const detectedProviders = detectProviders();
  let selectedProvider = options.provider;
  let cursorOnlyMode = false;

  if (!selectedProvider) {
    if (detectedProviders.length >= 1) {
      selectedProvider = detectedProviders[0];
      if (interactive && detectedProviders.length === 1) {
        p.log.success(`Detected API key for ${chalk.bold(PROVIDER_INFO[selectedProvider].label)}`);
      }
    } else {
      selectedProvider = "anthropic";
      if (!interactive && !useDefaults) {
        console.log(chalk.dim("No API key detected; defaulting provider to anthropic."));
      }
    }
  }

  if (interactive && !useDefaults) {
    if (detectedProviders.length > 1 && !options.provider) {
      const provider = await p.select({
        message: `Found ${detectedProviders.length} API keys. Which provider?`,
        options: detectedProviders.map((prov) => ({
          value: prov,
          label: PROVIDER_INFO[prov].label,
          hint: PROVIDER_INFO[prov].hint,
        })),
      });

      if (p.isCancel(provider)) {
        p.cancel("Setup cancelled.");
        process.exit(0);
      }

      selectedProvider = provider as string;
    } else if (detectedProviders.length === 0 && !options.provider) {
      p.log.warn("No API keys detected in environment.");

      const provider = await p.select({
        message: "Which AI provider will you use?",
        options: [
          ...Object.entries(PROVIDER_INFO).map(([key, info]) => ({
            value: key,
            label: info.label,
            hint: info.hint,
          })),
          {
            value: "__cursor__",
            label: "None — I use Cursor / another AI editor",
            hint: "Let your editor's AI populate context via MCP",
          },
        ],
      });

      if (p.isCancel(provider)) {
        p.cancel("Setup cancelled.");
        process.exit(0);
      }

      if (provider === "__cursor__") {
        cursorOnlyMode = true;
        selectedProvider = "anthropic"; // placeholder, won't be used for analysis
        p.log.success("No API key needed! Your editor's AI will populate context via MCP tools.");
      } else {
        selectedProvider = provider as string;
        const info = PROVIDER_INFO[selectedProvider];
        p.log.info(`Set your API key:\n  ${chalk.cyan(`export ${info.envVar}=your-key-here`)}`);
      }
    }
  }

  // Step 3: Embeddings
  let selectedEmbedding: string | undefined;
  const embeddingKeys = detectEmbeddingProviders();

  // In cursor-only mode, skip embeddings prompt
  if (cursorOnlyMode) {
    selectedEmbedding = embeddingKeys.length > 0 ? embeddingKeys[0].provider : "__none__";
  } else if (options.embeddingProvider) {
    const normalized = options.embeddingProvider.toLowerCase();
    if (!["openai", "gemini", "none"].includes(normalized)) {
      console.log(chalk.red(`Invalid embedding provider "${options.embeddingProvider}". Use openai, gemini, or none.`));
      process.exit(1);
    }
    selectedEmbedding = normalized === "none" ? "__none__" : normalized;
  } else if (embeddingKeys.length > 0) {
    selectedEmbedding = embeddingKeys[0].provider;

    if (interactive && !useDefaults) {
      const embeddingOptions = [
        { value: "auto", label: "Auto-detect", hint: `Will use ${embeddingKeys[0].label}` },
        ...embeddingKeys.map((k) => ({ value: k.provider, label: k.label })),
        { value: "none", label: "None", hint: "Keyword search only \u2014 no API costs" },
      ];

      const embedding = await p.select({
        message: "Embedding provider for semantic search?",
        options: embeddingOptions,
      });

      if (p.isCancel(embedding)) {
        p.cancel("Setup cancelled.");
        process.exit(0);
      }

      if (embedding !== "auto") {
        selectedEmbedding = embedding === "none" ? "__none__" : (embedding as string);
      }
    }
  } else {
    selectedEmbedding = "__none__";
    if (interactive) {
      p.log.info("No embedding API keys found. Search will use keyword matching only.");
      p.log.info(chalk.dim("  Set OPENAI_API_KEY or GEMINI_API_KEY to enable semantic search later."));
    }
  }

  // Step 4: Tools
  let selectedTools: ToolName[] = requestedTools;
  if (cursorOnlyMode) {
    // In cursor-only mode, replace the default ["claude"] with ["cursor"]
    if (!options.tools) {
      selectedTools = ["cursor"];
    } else if (!selectedTools.includes("cursor")) {
      selectedTools = ["cursor", ...selectedTools];
    }
  }
  if (interactive && !options.tools && !useDefaults && !cursorOnlyMode) {
    const tools = await p.multiselect({
      message: "Which AI tools do you use?",
      options: [
        { value: "claude", label: "Claude Code", hint: "MCP server auto-starts" },
        { value: "cursor", label: "Cursor", hint: "Adds .cursor/rules/" },
        { value: "copilot", label: "GitHub Copilot", hint: "Adds copilot-instructions.md" },
        { value: "windsurf", label: "Windsurf", hint: "Adds .windsurfrules" },
        { value: "cline", label: "Cline", hint: "Adds .clinerules" },
        { value: "aider", label: "Aider", hint: "Adds .aider.conf.yml" },
        { value: "continue", label: "Continue", hint: "Adds .continue/rules/" },
      ],
      required: false,
    });

    if (p.isCancel(tools)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    selectedTools = (tools as ToolName[]) || [];
  }

  // Step 5: Analyze decision
  let runAnalysis = !Boolean(options.skipAnalyze) && !cursorOnlyMode;
  if (interactive && !options.skipAnalyze && !useDefaults && !cursorOnlyMode) {
    const confirmAnalyze = await p.confirm({
      message: `Analyze your repo with ${PROVIDER_INFO[selectedProvider!].label}? (2-5 min, uses AI)`,
      initialValue: true,
    });

    if (p.isCancel(confirmAnalyze)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    runAnalysis = Boolean(confirmAnalyze);
  }

  if (!interactive) console.log();

  const s = p.spinner();
  const config = loadConfig(repoRoot);

  // Init
  s.start("Initializing .context/ directory...");
  if (!contextExists) {
    const store = new ContextStore(repoRoot, config);
    store.scaffold();
    store.writeIndex(STARTER_INDEX);
    const embeddingToWrite = selectedEmbedding === "__none__" ? undefined : selectedEmbedding;
    writeDefaultConfigFile(repoRoot, selectedProvider!, config.model, embeddingToWrite);
  }

  if (requestedMaxFiles) {
    const configPath = join(repoRoot, ".repomemory.json");
    let existingConfig: Record<string, unknown> = {};
    if (existsSync(configPath)) {
      try {
        existingConfig = JSON.parse(readFileSync(configPath, "utf-8"));
      } catch {
        existingConfig = {};
      }
    }
    existingConfig.maxFilesForAnalysis = requestedMaxFiles;
    existingConfig.provider = selectedProvider;
    if (selectedEmbedding && selectedEmbedding !== "__none__") {
      existingConfig.embeddingProvider = selectedEmbedding;
    }
    writeFileSync(configPath, JSON.stringify(existingConfig, null, 2) + "\n");
  }

  s.stop("Initialized .context/ directory");

  // Setup tools
  for (const tool of selectedTools) {
    s.start(`Configuring ${tool}...`);
    await setupCommand(tool, { dir: repoRoot });
    s.stop(`Configured ${tool}`);
  }

  // Analyze
  if (runAnalysis) {
    console.log();
    await analyzeCommand({
      dir: repoRoot,
      provider: selectedProvider,
      verbose: false,
      dryRun: false,
      merge: false,
    });
  }

  console.log();
  const nextSteps = [
    `${chalk.cyan("git add .context/ && git commit -m 'Add repomemory'")}`,
    "",
    "Your team now shares the knowledge.",
    "",
  ];

  if (cursorOnlyMode) {
    nextSteps.push(
      chalk.bold("To populate context, open Cursor and type:"),
      `  ${chalk.cyan("/repomemory-analyze")}`,
      "",
      "Cursor's own AI will scan your repo and populate .context/ via MCP tools.",
      "No API key needed — your Cursor subscription handles it.",
    );
  } else {
    nextSteps.push(
      selectedTools.includes("claude")
        ? "Claude Code will auto-discover context via the MCP server."
        : `Run ${chalk.cyan("repomemory setup claude")} to add MCP server integration.`,
    );
  }

  nextSteps.push(
    "",
    `Run ${chalk.cyan("repomemory status")} to see your context coverage.`,
    `Run ${chalk.cyan("repomemory analyze --merge")} to update without overwriting edits.`,
    `Run ${chalk.cyan("repomemory dashboard")} to browse context in your browser.`,
    "",
    chalk.dim(`Tip: Next time, use ${chalk.cyan("npx repomemory go --yes")} for deterministic one-command setup.`),
  );

  p.note(nextSteps.join("\n"), "Next steps");

  p.outro(chalk.green("Your codebase will never forget again."));
}
