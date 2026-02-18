import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { z } from "zod";

const ProviderSchema = z.enum(["anthropic", "openai", "gemini", "grok"]);

const ConfigFileSchema = z.object({
  provider: ProviderSchema.optional(),
  model: z.string().optional(),
  apiKey: z.string().optional(),
  ignorePatterns: z.array(z.string()).optional(),
  keyFilePatterns: z.array(z.string()).optional(),
  maxFileSize: z.number().positive().optional(),
  maxFilesForAnalysis: z.number().positive().optional(),
  maxGitCommits: z.number().positive().optional(),
  categories: z.array(z.string()).optional(),
  autoIndex: z.boolean().optional(),
  contextDir: z.string().optional(),
});

export type Provider = z.infer<typeof ProviderSchema>;

export interface RepoContextConfig {
  provider: Provider;
  model: string;
  apiKey?: string;
  ignorePatterns: string[];
  keyFilePatterns: string[];
  maxFileSize: number;
  maxFilesForAnalysis: number;
  maxGitCommits: number;
  categories: string[];
  autoIndex: boolean;
  contextDir: string;
}

export const DEFAULT_CONFIG: RepoContextConfig = {
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
    "pyproject.toml",
    "requirements.txt",
    "Cargo.toml",
    "go.mod",
    "Gemfile",
    "build.gradle",
    "pom.xml",
  ],
  maxFileSize: 100_000,
  maxFilesForAnalysis: 80,
  maxGitCommits: 100,
  categories: ["facts", "decisions", "regressions", "sessions", "changelog"],
  autoIndex: true,
  contextDir: ".context",
};

export function loadConfig(repoRoot: string): RepoContextConfig {
  const configPath = join(repoRoot, ".repomemory.json");

  if (!existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const raw = JSON.parse(readFileSync(configPath, "utf-8"));
    const parsed = ConfigFileSchema.safeParse(raw);

    if (!parsed.success) {
      console.error(
        `Warning: Invalid .repomemory.json — ${parsed.error.issues.map((i) => i.message).join(", ")}. Using defaults.`
      );
      return { ...DEFAULT_CONFIG };
    }

    const userConfig = parsed.data;
    return {
      ...DEFAULT_CONFIG,
      ...userConfig,
      provider: userConfig.provider ?? DEFAULT_CONFIG.provider,
      model: userConfig.model ?? DEFAULT_CONFIG.model,
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
