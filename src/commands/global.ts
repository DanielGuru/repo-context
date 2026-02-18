import chalk from "chalk";
import { ContextStore } from "../lib/context-store.js";
import { DEFAULT_CONFIG, resolveGlobalDir } from "../lib/config.js";

function getGlobalStore(): ContextStore {
  const globalDir = resolveGlobalDir(DEFAULT_CONFIG);
  const store = ContextStore.forAbsolutePath(globalDir);
  if (!store.exists()) {
    store.scaffold();
    console.log(chalk.dim(`  Created global context at ${globalDir}`));
  }
  return store;
}

export async function globalListCommand(options: { category?: string }) {
  const store = getGlobalStore();
  const entries = store.listEntries(options.category);

  if (entries.length === 0) {
    console.log(chalk.dim("  No global context entries."));
    console.log(chalk.dim("  AI agents will populate this as they learn your preferences."));
    return;
  }

  const grouped: Record<string, typeof entries> = {};
  for (const e of entries) {
    if (!grouped[e.category]) grouped[e.category] = [];
    grouped[e.category].push(e);
  }

  for (const [cat, catEntries] of Object.entries(grouped)) {
    console.log(chalk.bold(`${cat}/`) + chalk.dim(` (${catEntries.length})`));
    for (const e of catEntries) {
      console.log(`  ${e.filename} ${chalk.dim("—")} ${e.title}`);
    }
  }
}

export async function globalReadCommand(entry: string) {
  const store = getGlobalStore();

  const parts = entry.split("/");
  if (parts.length !== 2) {
    console.error(chalk.red("  Usage: repomemory global read <category/filename>"));
    console.error(chalk.dim("  Example: repomemory global read preferences/coding-style"));
    process.exit(1);
  }

  const [category, filename] = parts;
  const fname = filename.endsWith(".md") ? filename : filename + ".md";
  const content = store.readEntry(category, fname);

  if (!content) {
    console.error(chalk.red(`  Not found: ${category}/${fname}`));
    process.exit(1);
  }

  console.log(content);
}

export async function globalWriteCommand(entry: string, options: { content?: string }) {
  const store = getGlobalStore();

  const parts = entry.split("/");
  if (parts.length !== 2) {
    console.error(chalk.red("  Usage: repomemory global write <category/filename> --content \"...\""));
    process.exit(1);
  }

  const [category, filename] = parts;

  if (!options.content) {
    console.error(chalk.red("  --content is required"));
    process.exit(1);
  }

  const relativePath = store.writeEntry(category, filename, options.content);
  console.log(chalk.green(`  \u2713 Written to ${relativePath}`));
}

export async function globalDeleteCommand(entry: string) {
  const store = getGlobalStore();

  const parts = entry.split("/");
  if (parts.length !== 2) {
    console.error(chalk.red("  Usage: repomemory global delete <category/filename>"));
    process.exit(1);
  }

  const [category, filename] = parts;
  const fname = filename.endsWith(".md") ? filename : filename + ".md";
  const deleted = store.deleteEntry(category, fname);

  if (!deleted) {
    console.error(chalk.red(`  Not found: ${category}/${fname}`));
    process.exit(1);
  }

  console.log(chalk.green(`  \u2713 Deleted ${category}/${fname}`));
}

export async function globalExportCommand() {
  const store = getGlobalStore();
  const entries = store.listEntries();

  const exported = entries.map((e) => ({
    category: e.category,
    filename: e.filename,
    content: e.content,
  }));

  console.log(JSON.stringify(exported, null, 2));
}

export async function globalImportCommand() {
  const store = getGlobalStore();

  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  const entries = JSON.parse(input) as Array<{ category: string; filename: string; content: string }>;
  let count = 0;

  for (const entry of entries) {
    store.writeEntry(entry.category, entry.filename, entry.content);
    count++;
  }

  console.log(chalk.green(`  \u2713 Imported ${count} entries`));
}
