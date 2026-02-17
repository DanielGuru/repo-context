import { readdirSync, readFileSync, statSync } from "fs";
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
};

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".webp", ".avif",
  ".woff", ".woff2", ".ttf", ".eot", ".otf",
  ".mp3", ".mp4", ".wav", ".webm", ".ogg",
  ".zip", ".tar", ".gz", ".bz2", ".7z", ".rar",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx",
  ".exe", ".dll", ".so", ".dylib",
  ".sqlite", ".db",
  ".wasm",
]);

function shouldIgnore(name: string, ignorePatterns: string[]): boolean {
  return ignorePatterns.some((pattern) => {
    if (pattern.includes("*")) {
      const regex = new RegExp(
        "^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$"
      );
      return regex.test(name);
    }
    return name === pattern;
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
        const regex = new RegExp(
          suffix.replace(/\*/g, ".*").replace(/\?/g, ".")
        );
        return regex.test(name);
      }
      return relativePath.endsWith(suffix) || name === suffix;
    }
    if (pattern.includes("*")) {
      const regex = new RegExp(
        "^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$"
      );
      return regex.test(name);
    }
    return name === pattern || relativePath === pattern;
  });
}

export function scanRepo(
  root: string,
  config: RepoContextConfig
): RepoScan {
  const allFiles: RepoFile[] = [];
  const treeLines: string[] = [];
  const languages: Record<string, number> = {};
  let totalDirs = 0;

  function walk(dir: string, prefix: string, depth: number) {
    if (depth > 6) return; // Don't go too deep

    let entries: string[];
    try {
      entries = readdirSync(dir).sort();
    } catch {
      return;
    }

    const filtered = entries.filter(
      (e) => !shouldIgnore(e, config.ignorePatterns) && !e.startsWith(".")
    );

    filtered.forEach((entry, idx) => {
      const fullPath = join(dir, entry);
      const relPath = relative(root, fullPath);
      const isLast = idx === filtered.length - 1;
      const connector = isLast ? "└── " : "├── ";
      const childPrefix = isLast ? "    " : "│   ";

      try {
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          totalDirs++;
          treeLines.push(`${prefix}${connector}${entry}/`);
          walk(fullPath, prefix + childPrefix, depth + 1);
        } else {
          // Track file
          const ext = extname(entry).toLowerCase();
          if (LANGUAGE_MAP[ext]) {
            languages[LANGUAGE_MAP[ext]] =
              (languages[LANGUAGE_MAP[ext]] || 0) + 1;
          }

          // Only add to tree at shallow depths
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

  if (fileNames.has("package-lock.json")) packageManagers.push("npm");
  if (fileNames.has("yarn.lock")) packageManagers.push("yarn");
  if (fileNames.has("pnpm-lock.yaml")) packageManagers.push("pnpm");
  if (fileNames.has("bun.lockb")) packageManagers.push("bun");

  // Read package.json for framework detection
  const pkgJsonPath = join(root, "package.json");
  try {
    const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };
    if (allDeps["next"]) frameworks.push("Next.js");
    if (allDeps["react"]) frameworks.push("React");
    if (allDeps["vue"]) frameworks.push("Vue");
    if (allDeps["svelte"]) frameworks.push("Svelte");
    if (allDeps["express"]) frameworks.push("Express");
    if (allDeps["fastify"]) frameworks.push("Fastify");
    if (allDeps["hono"]) frameworks.push("Hono");
    if (allDeps["drizzle-orm"]) frameworks.push("Drizzle ORM");
    if (allDeps["prisma"] || allDeps["@prisma/client"]) frameworks.push("Prisma");
    if (allDeps["django"]) frameworks.push("Django");
    if (allDeps["flask"]) frameworks.push("Flask");
    if (allDeps["@cloudflare/workers-types"]) frameworks.push("Cloudflare Workers");
  } catch {
    // No package.json or can't parse
  }

  // Check for monorepo
  const hasWorkspaces =
    allFiles.some((f) => f.relativePath === "pnpm-workspace.yaml") ||
    allFiles.some((f) => {
      if (basename(f.relativePath) !== "package.json" || f.relativePath !== "package.json") return false;
      try {
        const pkg = JSON.parse(readFileSync(f.path, "utf-8"));
        return pkg.workspaces != null;
      } catch {
        return false;
      }
    });

  // Read key files
  const keyFiles = allFiles
    .filter((f) => f.isKeyFile && !isBinaryFile(f.path) && f.size <= config.maxFileSize)
    .sort((a, b) => {
      // Prioritize root-level files
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
