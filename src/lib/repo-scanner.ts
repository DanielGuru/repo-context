import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { join, relative, extname, basename } from "path";
import type { RepoContextConfig } from "./config.js";

export interface RepoFile {
  path: string;
  relativePath: string;
  size: number;
  isKeyFile: boolean;
}

export interface RepoScan {
  root: string;
  tree: string;
  keyFiles: { path: string; content: string }[];
  allFiles: RepoFile[];
  stats: {
    totalFiles: number;
    totalDirs: number;
    languages: Record<string, number>;
    hasMonorepo: boolean;
    packageManagers: string[];
    frameworks: string[];
  };
}

const LANGUAGE_MAP: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript/React",
  ".js": "JavaScript",
  ".jsx": "JavaScript/React",
  ".py": "Python",
  ".rs": "Rust",
  ".go": "Go",
  ".java": "Java",
  ".rb": "Ruby",
  ".php": "PHP",
  ".swift": "Swift",
  ".kt": "Kotlin",
  ".cs": "C#",
  ".cpp": "C++",
  ".c": "C",
  ".vue": "Vue",
  ".svelte": "Svelte",
  ".zig": "Zig",
  ".ex": "Elixir",
  ".exs": "Elixir",
  ".scala": "Scala",
  ".dart": "Dart",
  ".lua": "Lua",
};

const ALLOWED_DOTDIRS = new Set([".github", ".vscode", ".cursor"]);

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".svg",
  ".webp",
  ".avif",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".otf",
  ".mp3",
  ".mp4",
  ".wav",
  ".webm",
  ".ogg",
  ".zip",
  ".tar",
  ".gz",
  ".bz2",
  ".7z",
  ".rar",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".sqlite",
  ".db",
  ".wasm",
]);

function loadGitignorePatterns(repoRoot: string): string[] {
  const gitignorePath = join(repoRoot, ".gitignore");
  if (!existsSync(gitignorePath)) return [];

  try {
    return readFileSync(gitignorePath, "utf-8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => line.replace(/\/$/, "")); // Remove trailing slash
  } catch {
    return [];
  }
}

function shouldIgnore(name: string, ignorePatterns: string[]): boolean {
  return ignorePatterns.some((pattern) => {
    // Strip leading /
    const p = pattern.startsWith("/") ? pattern.slice(1) : pattern;

    if (p.includes("*")) {
      const regex = new RegExp(
        "^" + p.replace(/\./g, "\\.").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*").replace(/\?/g, ".") + "$"
      );
      return regex.test(name);
    }
    return name === p;
  });
}

function isBinaryFile(filePath: string): boolean {
  return BINARY_EXTENSIONS.has(extname(filePath).toLowerCase());
}

function matchesKeyPattern(relativePath: string, patterns: string[]): boolean {
  const name = basename(relativePath);
  return patterns.some((pattern) => {
    if (pattern.includes("**/")) {
      const suffix = pattern.replace("**/", "");
      if (suffix.includes("*")) {
        const regex = new RegExp(suffix.replace(/\./g, "\\.").replace(/\*/g, "[^/]*").replace(/\?/g, "."));
        return regex.test(name);
      }
      return relativePath.endsWith(suffix) || name === suffix;
    }
    if (pattern.includes("*")) {
      const regex = new RegExp("^" + pattern.replace(/\./g, "\\.").replace(/\*/g, "[^/]*").replace(/\?/g, ".") + "$");
      return regex.test(name);
    }
    return name === pattern || relativePath === pattern;
  });
}

export function scanRepo(root: string, config: RepoContextConfig): RepoScan {
  const allFiles: RepoFile[] = [];
  const treeLines: string[] = [];
  const languages: Record<string, number> = {};
  let totalDirs = 0;

  // Merge gitignore patterns with config patterns
  const gitignorePatterns = loadGitignorePatterns(root);
  const allIgnorePatterns = [...config.ignorePatterns, ...gitignorePatterns];

  function walk(dir: string, prefix: string, depth: number) {
    if (depth > 6) return;

    let entries: string[];
    try {
      entries = readdirSync(dir).sort();
    } catch {
      return;
    }

    const filtered = entries.filter(
      (e) => !shouldIgnore(e, allIgnorePatterns) && (!e.startsWith(".") || ALLOWED_DOTDIRS.has(e))
    );

    filtered.forEach((entry, idx) => {
      const fullPath = join(dir, entry);
      const relPath = relative(root, fullPath);
      const isLast = idx === filtered.length - 1;
      const connector = isLast ? "\u2514\u2500\u2500 " : "\u251c\u2500\u2500 ";
      const childPrefix = isLast ? "    " : "\u2502   ";

      try {
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          totalDirs++;
          if (depth <= 3) {
            treeLines.push(`${prefix}${connector}${entry}/`);
          }
          walk(fullPath, prefix + childPrefix, depth + 1);
        } else {
          const ext = extname(entry).toLowerCase();
          if (LANGUAGE_MAP[ext]) {
            languages[LANGUAGE_MAP[ext]] = (languages[LANGUAGE_MAP[ext]] || 0) + 1;
          }

          if (depth <= 3) {
            treeLines.push(`${prefix}${connector}${entry}`);
          }

          allFiles.push({
            path: fullPath,
            relativePath: relPath,
            size: stat.size,
            isKeyFile: matchesKeyPattern(relPath, config.keyFilePatterns),
          });
        }
      } catch {
        // Skip files we can't stat
      }
    });
  }

  walk(root, "", 0);

  // Detect frameworks and package managers
  const packageManagers: string[] = [];
  const frameworks: string[] = [];
  const fileNames = new Set(allFiles.map((f) => basename(f.relativePath)));
  const rootFiles = new Set(allFiles.filter((f) => !f.relativePath.includes("/")).map((f) => f.relativePath));

  if (fileNames.has("package-lock.json")) packageManagers.push("npm");
  if (fileNames.has("yarn.lock")) packageManagers.push("yarn");
  if (fileNames.has("pnpm-lock.yaml")) packageManagers.push("pnpm");
  if (fileNames.has("bun.lockb")) packageManagers.push("bun");
  if (rootFiles.has("Cargo.toml")) packageManagers.push("cargo");
  if (rootFiles.has("go.mod")) packageManagers.push("go modules");
  if (rootFiles.has("Gemfile")) packageManagers.push("bundler");
  if (rootFiles.has("requirements.txt") || rootFiles.has("pyproject.toml")) packageManagers.push("pip");

  // Read package.json for framework detection
  const pkgJsonPath = join(root, "package.json");
  try {
    const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };
    if (allDeps["next"]) frameworks.push("Next.js");
    if (allDeps["react"] && !allDeps["next"]) frameworks.push("React");
    if (allDeps["vue"]) frameworks.push("Vue");
    if (allDeps["nuxt"]) frameworks.push("Nuxt");
    if (allDeps["svelte"] || allDeps["@sveltejs/kit"]) frameworks.push("Svelte");
    if (allDeps["express"]) frameworks.push("Express");
    if (allDeps["fastify"]) frameworks.push("Fastify");
    if (allDeps["hono"]) frameworks.push("Hono");
    if (allDeps["drizzle-orm"]) frameworks.push("Drizzle ORM");
    if (allDeps["prisma"] || allDeps["@prisma/client"]) frameworks.push("Prisma");
    if (allDeps["@cloudflare/workers-types"]) frameworks.push("Cloudflare Workers");
    if (allDeps["astro"]) frameworks.push("Astro");
    if (allDeps["remix"] || allDeps["@remix-run/node"]) frameworks.push("Remix");
    if (allDeps["angular"] || allDeps["@angular/core"]) frameworks.push("Angular");
    if (allDeps["tailwindcss"]) frameworks.push("Tailwind CSS");
    if (allDeps["styled-components"]) frameworks.push("Styled Components");
    if (allDeps["@emotion/react"] || allDeps["@emotion/styled"]) frameworks.push("Emotion");
    if (allDeps["@mui/material"]) frameworks.push("Material UI");
    if (allDeps["@chakra-ui/react"]) frameworks.push("Chakra UI");
    if (allDeps["@radix-ui/react-slot"] || allDeps["@radix-ui/themes"]) frameworks.push("Radix UI");
    if (allDeps["shadcn-ui"] || allDeps["class-variance-authority"]) frameworks.push("shadcn/ui");
  } catch {
    // No package.json or can't parse
  }

  // Detect from other ecosystem files
  if (rootFiles.has("Cargo.toml")) {
    try {
      const cargo = readFileSync(join(root, "Cargo.toml"), "utf-8");
      if (cargo.includes("actix")) frameworks.push("Actix");
      if (cargo.includes("axum")) frameworks.push("Axum");
      if (cargo.includes("tokio")) frameworks.push("Tokio");
    } catch {}
  }

  if (rootFiles.has("go.mod")) {
    try {
      const gomod = readFileSync(join(root, "go.mod"), "utf-8");
      if (gomod.includes("gin-gonic")) frameworks.push("Gin");
      if (gomod.includes("fiber")) frameworks.push("Fiber");
      if (gomod.includes("echo")) frameworks.push("Echo");
    } catch {}
  }

  if (rootFiles.has("pyproject.toml") || rootFiles.has("requirements.txt")) {
    try {
      const pyfile = rootFiles.has("pyproject.toml")
        ? readFileSync(join(root, "pyproject.toml"), "utf-8")
        : readFileSync(join(root, "requirements.txt"), "utf-8");
      if (pyfile.includes("django")) frameworks.push("Django");
      if (pyfile.includes("flask")) frameworks.push("Flask");
      if (pyfile.includes("fastapi")) frameworks.push("FastAPI");
    } catch {}
  }

  // Check for monorepo — root package.json with workspaces field
  const hasWorkspaces =
    allFiles.some((f) => f.relativePath === "pnpm-workspace.yaml") ||
    (() => {
      try {
        const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
        return pkg.workspaces != null;
      } catch {
        return false;
      }
    })();

  // Read key files
  const keyFiles = allFiles
    .filter((f) => f.isKeyFile && !isBinaryFile(f.path) && f.size <= config.maxFileSize)
    .sort((a, b) => {
      const aDepth = a.relativePath.split("/").length;
      const bDepth = b.relativePath.split("/").length;
      return aDepth - bDepth;
    })
    .slice(0, config.maxFilesForAnalysis)
    .map((f) => {
      try {
        return {
          path: f.relativePath,
          content: readFileSync(f.path, "utf-8").slice(0, config.maxFileSize),
        };
      } catch {
        return { path: f.relativePath, content: "[Could not read file]" };
      }
    });

  return {
    root,
    tree: treeLines.join("\n"),
    keyFiles,
    allFiles,
    stats: {
      totalFiles: allFiles.length,
      totalDirs,
      languages,
      hasMonorepo: hasWorkspaces,
      packageManagers,
      frameworks,
    },
  };
}
