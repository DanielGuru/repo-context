import chalk from "chalk";
import * as p from "@clack/prompts";
import { existsSync } from "fs";
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

export async function wizardCommand(options: { dir?: string }) {
  const repoRoot = options.dir || process.cwd();

  p.intro(chalk.bgCyan.black(" repomemory ") + chalk.dim(" Your codebase never forgets."));

  // Step 1: Check if already initialized
  const contextExists = existsSync(join(repoRoot, ".context"));
  if (contextExists) {
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

  // Step 2: Detect available API keys
  const detectedProviders: string[] = [];
  for (const [provider, info] of Object.entries(PROVIDER_INFO)) {
    if (process.env[info.envVar]) {
      detectedProviders.push(provider);
    }
  }
  // Check alternate env vars
  if (!detectedProviders.includes("gemini") && (process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY)) {
    detectedProviders.push("gemini");
  }
  if (!detectedProviders.includes("grok") && process.env.XAI_API_KEY) {
    detectedProviders.push("grok");
  }

  // Step 3: Choose provider
  let selectedProvider: string;

  if (detectedProviders.length === 1) {
    p.log.success(`Detected API key for ${chalk.bold(PROVIDER_INFO[detectedProviders[0]].label)}`);
    selectedProvider = detectedProviders[0];
  } else if (detectedProviders.length > 1) {
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
  } else {
    // No API keys found — ask which they want to use
    p.log.warn("No API keys detected in environment.");

    const provider = await p.select({
      message: "Which AI provider will you use?",
      options: Object.entries(PROVIDER_INFO).map(([key, info]) => ({
        value: key,
        label: info.label,
        hint: info.hint,
      })),
    });

    if (p.isCancel(provider)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    selectedProvider = provider as string;
    const info = PROVIDER_INFO[selectedProvider];

    p.log.info(`Set your API key:\n  ${chalk.cyan(`export ${info.envVar}=your-key-here`)}`);

    const hasKey = await p.confirm({
      message: "Have you set the key? (You can set it now in another terminal)",
      initialValue: false,
    });

    if (p.isCancel(hasKey) || !hasKey) {
      p.log.info("You can run this wizard again after setting your API key.");
      p.log.info(`  ${chalk.dim(`export ${info.envVar}=...`)}`);
      p.log.info(`  ${chalk.dim("repomemory wizard")}`);
      p.outro("See you soon!");
      process.exit(0);
    }
  }

  // Step 4: Choose AI tools to integrate
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

  const selectedTools = tools as string[];

  // Step 5: Run analysis?
  const runAnalysis = await p.confirm({
    message: `Analyze your repo with ${PROVIDER_INFO[selectedProvider].label}? (2-5 min, uses AI)`,
    initialValue: true,
  });

  if (p.isCancel(runAnalysis)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  // Step 6: Execute everything
  console.log(); // spacing

  const s = p.spinner();

  // Init — use shared helpers directly to avoid interleaved console output
  s.start("Initializing .context/ directory...");
  if (!contextExists) {
    const config = loadConfig(repoRoot);
    const store = new ContextStore(repoRoot, config);
    store.scaffold();
    store.writeIndex(STARTER_INDEX);
    writeDefaultConfigFile(repoRoot, selectedProvider, config.model);
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
    console.log(); // spacing before analyze (it has its own output)
    await analyzeCommand({
      dir: repoRoot,
      provider: selectedProvider,
      verbose: false,
    });
  }

  // Done!
  console.log();
  p.note(
    [
      `${chalk.cyan("git add .context/ && git commit -m 'Add repomemory'")}`,
      "",
      "Your team now shares the knowledge.",
      "",
      selectedTools.includes("claude")
        ? "Claude Code will auto-discover context via the MCP server."
        : `Run ${chalk.cyan("repomemory setup claude")} to add MCP server integration.`,
      "",
      `Run ${chalk.cyan("repomemory status")} to see your context coverage.`,
      `Run ${chalk.cyan("repomemory analyze --merge")} to update without overwriting edits.`,
      `Run ${chalk.cyan("repomemory dashboard")} to browse context in your browser.`,
      "",
      chalk.dim(`Tip: Next time, use ${chalk.cyan("npx repomemory go")} for quick one-command setup.`),
    ].join("\n"),
    "Next steps"
  );

  p.outro(chalk.green("Your codebase will never forget again."));
}
