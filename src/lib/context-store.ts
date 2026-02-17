import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
} from "fs";
import { join, relative, basename, extname } from "path";
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
    ];

    for (const dir of dirs) {
      mkdirSync(dir, { recursive: true });
    }

    // Create .gitignore for search index
    const gitignorePath = join(this.contextDir, ".gitignore");
    if (!existsSync(gitignorePath)) {
      writeFileSync(gitignorePath, ".search.db\n.search.db-*\n");
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

  writeEntry(
    category: string,
    filename: string,
    content: string
  ): string {
    const dir = join(this.contextDir, category);
    mkdirSync(dir, { recursive: true });

    // Ensure .md extension
    if (!filename.endsWith(".md")) {
      filename = filename + ".md";
    }

    // Sanitize filename
    filename = filename
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "-")
      .replace(/-+/g, "-");

    const filePath = join(dir, filename);
    writeFileSync(filePath, content);

    return relative(this.root, filePath);
  }

  appendEntry(
    category: string,
    filename: string,
    content: string
  ): string {
    const dir = join(this.contextDir, category);
    mkdirSync(dir, { recursive: true });

    if (!filename.endsWith(".md")) {
      filename = filename + ".md";
    }

    const filePath = join(dir, filename);
    let existing = "";
    if (existsSync(filePath)) {
      existing = readFileSync(filePath, "utf-8");
    }

    writeFileSync(filePath, existing + "\n\n" + content);
    return relative(this.root, filePath);
  }

  readEntry(category: string, filename: string): string | null {
    const filePath = join(this.contextDir, category, filename);
    if (!existsSync(filePath)) return null;
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

        // Extract title from first heading or filename
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
  } {
    const entries = this.listEntries();
    const categories: Record<string, number> = {};

    for (const entry of entries) {
      categories[entry.category] = (categories[entry.category] || 0) + 1;
    }

    return {
      totalFiles: entries.length,
      totalSize: entries.reduce((sum, e) => sum + e.sizeBytes, 0),
      categories,
    };
  }
}
