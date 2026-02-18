import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  unlinkSync,
} from "fs";
import { join, relative, basename } from "path";
import type { RepoContextConfig } from "./config.js";

export interface ContextEntry {
  category: string;
  filename: string;
  title: string;
  content: string;
  relativePath: string;
  lastModified: Date;
  sizeBytes: number;
}

export class ContextStore {
  private root: string;
  private contextDir: string;

  constructor(repoRoot: string, config: RepoContextConfig) {
    this.root = repoRoot;
    this.contextDir = join(repoRoot, config.contextDir);
  }

  get path(): string {
    return this.contextDir;
  }

  exists(): boolean {
    return existsSync(this.contextDir);
  }

  scaffold(): void {
    const dirs = [
      this.contextDir,
      join(this.contextDir, "facts"),
      join(this.contextDir, "decisions"),
      join(this.contextDir, "regressions"),
      join(this.contextDir, "sessions"),
      join(this.contextDir, "changelog"),
      join(this.contextDir, "preferences"),
    ];

    for (const dir of dirs) {
      mkdirSync(dir, { recursive: true });
    }

    const gitignorePath = join(this.contextDir, ".gitignore");
    if (!existsSync(gitignorePath)) {
      writeFileSync(gitignorePath, ".search.db\n.search.db-*\n.last-response.txt\n");
    }
  }

  writeIndex(content: string): void {
    writeFileSync(join(this.contextDir, "index.md"), content);
  }

  readIndex(): string {
    const indexPath = join(this.contextDir, "index.md");
    if (!existsSync(indexPath)) return "";
    return readFileSync(indexPath, "utf-8");
  }

  private sanitizeFilename(filename: string): string {
    const original = filename;
    if (!filename.endsWith(".md")) {
      filename = filename + ".md";
    }
    let sanitized = filename
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    // If all meaningful characters were stripped (e.g. all-unicode input),
    // generate a deterministic name from the original string
    const nameWithoutExt = sanitized.replace(/\.md$/, "");
    if (!nameWithoutExt) {
      let hash = 0;
      for (let i = 0; i < original.length; i++) {
        hash = ((hash << 5) - hash + original.charCodeAt(i)) | 0;
      }
      sanitized = `entry-${Math.abs(hash).toString(36)}.md`;
    }

    return sanitized;
  }

  private validateCategory(category: string): void {
    const allowed = ["facts", "decisions", "regressions", "sessions", "changelog", "preferences"];
    if (!allowed.includes(category)) {
      throw new Error(`Invalid category: ${category}. Allowed: ${allowed.join(", ")}`);
    }
  }

  writeEntry(
    category: string,
    filename: string,
    content: string
  ): string {
    this.validateCategory(category);

    const dir = join(this.contextDir, category);
    mkdirSync(dir, { recursive: true });

    const sanitized = this.sanitizeFilename(filename);
    const filePath = join(dir, sanitized);
    writeFileSync(filePath, content);

    return relative(this.root, filePath);
  }

  appendEntry(
    category: string,
    filename: string,
    content: string
  ): string {
    this.validateCategory(category);

    const dir = join(this.contextDir, category);
    mkdirSync(dir, { recursive: true });

    const sanitized = this.sanitizeFilename(filename);
    const filePath = join(dir, sanitized);
    let existing = "";
    if (existsSync(filePath)) {
      existing = readFileSync(filePath, "utf-8");
    }

    writeFileSync(filePath, existing ? existing + "\n\n" + content : content);
    return relative(this.root, filePath);
  }

  deleteEntry(category: string, filename: string): boolean {
    this.validateCategory(category);
    const sanitized = this.sanitizeFilename(filename);
    const filePath = join(this.contextDir, category, sanitized);
    if (!existsSync(filePath)) return false;

    unlinkSync(filePath);
    return true;
  }

  readEntry(category: string, filename: string): string | null {
    this.validateCategory(category);
    const filePath = join(this.contextDir, category, filename);
    if (!existsSync(filePath)) {
      // Try sanitized version
      const sanitized = this.sanitizeFilename(filename);
      const altPath = join(this.contextDir, category, sanitized);
      if (!existsSync(altPath)) return null;
      return readFileSync(altPath, "utf-8");
    }
    return readFileSync(filePath, "utf-8");
  }

  listEntries(category?: string): ContextEntry[] {
    const entries: ContextEntry[] = [];

    const dirsToScan = category
      ? [join(this.contextDir, category)]
      : readdirSync(this.contextDir)
          .filter((d) => {
            const fullPath = join(this.contextDir, d);
            return statSync(fullPath).isDirectory() && !d.startsWith(".");
          })
          .map((d) => join(this.contextDir, d));

    for (const dir of dirsToScan) {
      if (!existsSync(dir)) continue;

      const cat = basename(dir);
      const files = readdirSync(dir).filter(
        (f) => f.endsWith(".md") && !f.startsWith(".")
      );

      for (const file of files) {
        const filePath = join(dir, file);
        const stat = statSync(filePath);
        const content = readFileSync(filePath, "utf-8");

        const titleMatch = content.match(/^#\s+(.+)$/m);
        const title = titleMatch
          ? titleMatch[1]
          : basename(file, ".md").replace(/-/g, " ");

        entries.push({
          category: cat,
          filename: file,
          title,
          content,
          relativePath: relative(this.root, filePath),
          lastModified: stat.mtime,
          sizeBytes: stat.size,
        });
      }
    }

    // Also include index.md
    const indexPath = join(this.contextDir, "index.md");
    if (existsSync(indexPath) && !category) {
      const stat = statSync(indexPath);
      const content = readFileSync(indexPath, "utf-8");
      entries.push({
        category: "root",
        filename: "index.md",
        title: "Index",
        content,
        relativePath: relative(this.root, indexPath),
        lastModified: stat.mtime,
        sizeBytes: stat.size,
      });
    }

    return entries;
  }

  getAllContent(): string {
    const entries = this.listEntries();
    return entries
      .map(
        (e) =>
          `--- ${e.category}/${e.filename} ---\n${e.content}`
      )
      .join("\n\n");
  }

  getStats(): {
    totalFiles: number;
    totalSize: number;
    categories: Record<string, number>;
    stalestFile?: { path: string; age: number };
    newestFile?: { path: string; age: number };
  } {
    const entries = this.listEntries();
    const categories: Record<string, number> = {};
    let stalest: ContextEntry | null = null;
    let newest: ContextEntry | null = null;

    for (const entry of entries) {
      categories[entry.category] = (categories[entry.category] || 0) + 1;
      if (!stalest || entry.lastModified < stalest.lastModified) stalest = entry;
      if (!newest || entry.lastModified > newest.lastModified) newest = entry;
    }

    const now = Date.now();
    return {
      totalFiles: entries.length,
      totalSize: entries.reduce((sum, e) => sum + e.sizeBytes, 0),
      categories,
      stalestFile: stalest
        ? { path: `${stalest.category}/${stalest.filename}`, age: now - stalest.lastModified.getTime() }
        : undefined,
      newestFile: newest
        ? { path: `${newest.category}/${newest.filename}`, age: now - newest.lastModified.getTime() }
        : undefined,
    };
  }
}
