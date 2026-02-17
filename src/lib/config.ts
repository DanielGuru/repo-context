import { readFileSync, existsSync } from "fs";
import { join } from "path";

export interface RepoContextConfig {
  /** AI provider for analysis */
  provider: "anthropic" | "openai" | "gemini" | "grok";
  /** Model to use for analysis */
  model: string;
  /** API key (reads from env if not set) */
  apiKey?: string;
  /** Directory patterns to ignore during scanning */
  ignorePatterns: string[];
  /** File patterns to always read during analysis */
  keyFilePatterns: string[];
  /** Max file size to read (bytes) */
  maxFileSize: number;
  /** Max files to include in analysis */
  maxFilesForAnalysis: number;
  /** Max git commits to analyze */
  maxGitCommits: number;
  /** Categories for organizing knowledge */
  categories: string[];
  /** Whether to auto-index on write */
  autoIndex: boolean;
  /** Context directory name */
  contextDir: string;
}

const DEFAULT_CONFIG: RepoContextConfig = {
  provider: "anthropic",
  model: "claude-sonnet-4-5-20250929",
  ignorePatterns: [
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    ".nuxt",
    ".output",
    "coverage",
    "__pycache__",
    ".venv",
    "venv",
    "vendor",
    ".cache",
    ".turbo",
    ".vercel",
    ".netlify",
    "*.min.js",
    "*.min.css",
    "*.map",
    "*.lock",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lockb",
  ],
  keyFilePatterns: [
    "package.json",
    "README.md",
    "CLAUDE.md",
    ".cursorrules",
    ".cursor/rules/*.mdc",
    "tsconfig.json",
    "Dockerfile",
    "docker-compose.yml",
    "docker-compose.yaml",
    ".env.example",
    "wrangler.toml",
    "vercel.json",
    "railway.json",
    "Makefile",
    "justfile",
    "**/schema.ts",
    "**/schema.prisma",
    "drizzle.config.ts",
    ".github/workflows/*.yml",
  ],
  maxFileSize: 100_000, // 100KB
  maxFilesForAnalysis: 80,
  maxGitCommits: 100,
  categories: ["facts", "decisions", "regressions", "sessions", "changelog"],
  autoIndex: true,
  contextDir: ".context",
};

export function loadConfig(repoRoot: string): RepoContextConfig {
  const configPath = join(repoRoot, ".repo-context.json");

  if (!existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const userConfig = JSON.parse(readFileSync(configPath, "utf-8"));
    return {
      ...DEFAULT_CONFIG,
      ...userConfig,
      ignorePatterns: [
        ...DEFAULT_CONFIG.ignorePatterns,
        ...(userConfig.ignorePatterns || []),
      ],
      keyFilePatterns: [
        ...DEFAULT_CONFIG.keyFilePatterns,
        ...(userConfig.keyFilePatterns || []),
      ],
      categories: userConfig.categories || DEFAULT_CONFIG.categories,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function resolveApiKey(config: RepoContextConfig): string {
  if (config.apiKey) return config.apiKey;

  if (config.provider === "anthropic") {
    const key = process.env.ANTHROPIC_API_KEY;
    if (key) return key;
    throw new Error(
      "No API key found. Set ANTHROPIC_API_KEY environment variable or add apiKey to .repo-context.json"
    );
  }

  if (config.provider === "openai") {
    const key = process.env.OPENAI_API_KEY;
    if (key) return key;
    throw new Error(
      "No API key found. Set OPENAI_API_KEY environment variable or add apiKey to .repo-context.json"
    );
  }

  throw new Error(`Unknown provider: ${config.provider}`);
}

export { DEFAULT_CONFIG };
