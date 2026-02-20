import chalk from "chalk";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { loadConfig, resolveGlobalDir } from "../lib/config.js";
import { ContextStore } from "../lib/context-store.js";
import { SearchIndex } from "../lib/search.js";

interface CheckResult {
  id: string;
  status: "pass" | "warn" | "fail";
  message: string;
  detail?: string;
}

interface DoctorReport {
  generatedAt: string;
  repoRoot: string;
  version: string;
  summary: {
    pass: number;
    warn: number;
    fail: number;
  };
  checks: CheckResult[];
  environment: {
    node: string;
    platform: string;
    providerKeys: Record<string, boolean>;
    repomemoryDebug: boolean;
  };
}

function add(checks: CheckResult[], item: CheckResult): void {
  checks.push(item);
}

export async function doctorCommand(options: { dir?: string; json?: boolean; output?: string }) {
  const repoRoot = options.dir || process.cwd();
  const configPath = join(repoRoot, ".repomemory.json");
  const checks: CheckResult[] = [];

  const require = (await import("module")).createRequire(import.meta.url);
  const { version } = require("../../package.json") as { version: string };

  const config = loadConfig(repoRoot);
  add(checks, {
    id: "config-load",
    status: "pass",
    message: "Configuration loaded",
    detail: configPath,
  });

  if (existsSync(configPath)) {
    try {
      JSON.parse(readFileSync(configPath, "utf-8"));
      add(checks, {
        id: "config-json",
        status: "pass",
        message: ".repomemory.json is valid JSON",
      });
    } catch (err) {
      add(checks, {
        id: "config-json",
        status: "fail",
        message: ".repomemory.json is invalid JSON",
        detail: (err as Error).message,
      });
    }
  } else {
    add(checks, {
      id: "config-json",
      status: "warn",
      message: ".repomemory.json not found (defaults will be used)",
    });
  }

  const providerKeys = {
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    openai: Boolean(process.env.OPENAI_API_KEY),
    gemini: Boolean(
      process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY
    ),
    grok: Boolean(process.env.GROK_API_KEY || process.env.XAI_API_KEY),
  };

  if (providerKeys[config.provider]) {
    add(checks, {
      id: "provider-key",
      status: "pass",
      message: `API key detected for configured provider (${config.provider})`,
    });
  } else {
    add(checks, {
      id: "provider-key",
      status: "warn",
      message: `API key missing for configured provider (${config.provider})`,
      detail: "Analyze commands may fail until key is configured.",
    });
  }

  if (config.embeddingProvider) {
    const hasEmbedding = config.embeddingProvider === "openai" ? providerKeys.openai : providerKeys.gemini;
    add(checks, {
      id: "embedding-key",
      status: hasEmbedding ? "pass" : "warn",
      message: hasEmbedding
        ? `Embedding provider key available (${config.embeddingProvider})`
        : `Embedding provider key missing (${config.embeddingProvider})`,
    });
  }

  const store = new ContextStore(repoRoot, config);
  if (!store.exists()) {
    add(checks, {
      id: "context-dir",
      status: "warn",
      message: `${config.contextDir}/ directory not found. Run: repomemory init or repomemory go`,
    });
  } else {
    add(checks, {
      id: "context-dir",
      status: "pass",
      message: `${config.contextDir}/ directory exists`,
    });

    const expectedDirs = ["facts", "decisions", "regressions", "sessions", "changelog", "preferences"];
    const missingDirs = expectedDirs.filter((d) => !existsSync(join(store.path, d)));

    if (missingDirs.length === 0) {
      add(checks, {
        id: "context-structure",
        status: "pass",
        message: "Context directory structure looks healthy",
      });
    } else {
      add(checks, {
        id: "context-structure",
        status: "warn",
        message: `Missing context subdirectories: ${missingDirs.join(", ")}`,
      });
    }

    const indexContent = store.readIndex();
    add(checks, {
      id: "context-index",
      status: indexContent.trim().length > 0 ? "pass" : "warn",
      message: indexContent.trim().length > 0 ? "index.md present" : "index.md empty or missing",
    });

    try {
      const stats = store.getStats();
      add(checks, {
        id: "context-stats",
        status: "pass",
        message: `Loaded ${stats.totalFiles} context files`,
        detail: `categories=${Object.keys(stats.categories).length}, totalSize=${stats.totalSize}`,
      });
    } catch (err) {
      add(checks, {
        id: "context-stats",
        status: "fail",
        message: "Failed to compute context stats",
        detail: (err as Error).message,
      });
    }

    try {
      const { createEmbeddingProvider } = await import("../lib/embeddings.js");
      let embeddingProvider = null;
      try {
        embeddingProvider = await createEmbeddingProvider({
          provider: config.embeddingProvider,
          model: config.embeddingModel,
          apiKey: config.embeddingApiKey,
        });
      } catch {
        // Keyword-only
      }

      const index = new SearchIndex(store.path, store, embeddingProvider, config.hybridAlpha);
      await index.rebuild();
      const probe = await index.search("architecture", undefined, 1);
      const stats = await index.getStats();
      index.close();

      add(checks, {
        id: "search-db",
        status: "pass",
        message: "Search index is healthy",
        detail: `${stats.totalDocs} docs, ${stats.embeddedDocs} with embeddings, FTS5=${stats.hasFts5}, dims=${stats.embeddingDims}, db=${(stats.dbSizeBytes / 1024).toFixed(0)}KB`,
      });

      if (embeddingProvider && stats.embeddedDocs === 0 && stats.totalDocs > 0) {
        add(checks, {
          id: "embeddings",
          status: "warn",
          message: "Embedding provider configured but no entries have embeddings",
          detail: "Run `repomemory analyze` to populate embeddings for semantic search.",
        });
      } else if (embeddingProvider && stats.embeddedDocs > 0) {
        add(checks, {
          id: "embeddings",
          status: "pass",
          message: `Semantic search active (${stats.embeddedDocs}/${stats.totalDocs} entries embedded, ${stats.embeddingDims}d vectors)`,
        });
      } else if (!embeddingProvider) {
        add(checks, {
          id: "embeddings",
          status: "warn",
          message: "No embedding provider — using keyword search only",
          detail: "Set OPENAI_API_KEY or GEMINI_API_KEY to enable semantic search.",
        });
      }
    } catch (err) {
      add(checks, {
        id: "search-db",
        status: "fail",
        message: "Search index failed to initialize",
        detail: (err as Error).message,
      });
    }
  }

  if (config.enableGlobalContext) {
    const globalDir = resolveGlobalDir(config);
    const globalStore = ContextStore.forAbsolutePath(globalDir);
    add(checks, {
      id: "global-context",
      status: globalStore.exists() ? "pass" : "warn",
      message: globalStore.exists()
        ? `Global context found at ${globalDir}`
        : `Global context missing at ${globalDir} (will be created on go/setup)`,
    });
  }

  const localMcpConfig = join(repoRoot, ".mcp.json");
  add(checks, {
    id: "mcp-local",
    status: existsSync(localMcpConfig) ? "pass" : "warn",
    message: existsSync(localMcpConfig) ? ".mcp.json found" : ".mcp.json not found",
  });

  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const claudeConfigPath = homeDir ? join(homeDir, ".claude.json") : "";
  if (!homeDir || !existsSync(claudeConfigPath)) {
    add(checks, {
      id: "mcp-claude",
      status: "warn",
      message: "Claude config not found (~/.claude.json)",
    });
  } else {
    try {
      const cfg = JSON.parse(readFileSync(claudeConfigPath, "utf-8")) as { mcpServers?: Record<string, unknown> };
      const hasServer = Boolean(cfg.mcpServers?.repomemory);
      add(checks, {
        id: "mcp-claude",
        status: hasServer ? "pass" : "warn",
        message: hasServer ? "Claude MCP server entry exists" : "Claude MCP server entry missing",
      });
    } catch (err) {
      add(checks, {
        id: "mcp-claude",
        status: "fail",
        message: "Failed to parse ~/.claude.json",
        detail: (err as Error).message,
      });
    }
  }

  const summary = {
    pass: checks.filter((c) => c.status === "pass").length,
    warn: checks.filter((c) => c.status === "warn").length,
    fail: checks.filter((c) => c.status === "fail").length,
  };

  const report: DoctorReport = {
    generatedAt: new Date().toISOString(),
    repoRoot,
    version,
    summary,
    checks,
    environment: {
      node: process.version,
      platform: `${process.platform}/${process.arch}`,
      providerKeys,
      repomemoryDebug: Boolean(process.env.REPOMEMORY_DEBUG),
    },
  };

  if (options.output) {
    const outPath = options.output;
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(chalk.bold("\nrepomemory doctor\n"));
    console.log(chalk.dim(`Root: ${repoRoot}`));
    console.log(chalk.dim(`Version: ${version}\n`));

    for (const check of checks) {
      const icon =
        check.status === "pass"
          ? chalk.green("\u2713")
          : check.status === "warn"
            ? chalk.yellow("\u26a0")
            : chalk.red("\u2717");
      console.log(`${icon} ${check.message}`);
      if (check.detail) {
        console.log(chalk.dim(`   ${check.detail}`));
      }
    }

    console.log();
    const summaryColor = summary.fail > 0 ? chalk.red : summary.warn > 0 ? chalk.yellow : chalk.green;
    console.log(summaryColor(`Summary: ${summary.pass} pass, ${summary.warn} warn, ${summary.fail} fail`));

    if (options.output) {
      console.log(chalk.dim(`Support bundle written to ${options.output}`));
    }
    console.log();
  }

  if (summary.fail > 0) {
    process.exit(1);
  }
}
