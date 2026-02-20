import chalk from "chalk";
import { loadConfig, resolveGlobalDir } from "../lib/config.js";
import { ContextStore } from "../lib/context-store.js";
import { SearchIndex, type ExplainedSearchResult } from "../lib/search.js";
import { createEmbeddingProvider } from "../lib/embeddings.js";

export async function searchCommand(
  query: string,
  options: { dir?: string; category?: string; limit?: string; detail?: string; explain?: boolean }
) {
  const repoRoot = options.dir || process.cwd();
  const config = loadConfig(repoRoot);
  const store = new ContextStore(repoRoot, config);
  const limit = parseInt(options.limit || "10", 10);
  const detail = options.detail || "compact";
  const explain = Boolean(options.explain);

  if (!store.exists()) {
    console.error(chalk.red("\u2717 No .context/ directory found."));
    console.error(chalk.dim("  Run `repomemory init` to get started."));
    process.exit(1);
  }

  // Initialize embedding provider (optional)
  let embeddingProvider = null;
  try {
    embeddingProvider = await createEmbeddingProvider({
      provider: config.embeddingProvider,
      model: config.embeddingModel,
      apiKey: config.embeddingApiKey,
    });
  } catch {
    // Keyword-only search
  }

  // Build repo search index
  const searchIndex = new SearchIndex(store.path, store, embeddingProvider, config.hybridAlpha);
  await searchIndex.rebuild();

  // Also search global context if enabled
  let globalIndex: SearchIndex | null = null;
  if (config.enableGlobalContext) {
    try {
      const globalDir = resolveGlobalDir(config);
      const globalStore = ContextStore.forAbsolutePath(globalDir);
      if (globalStore.exists()) {
        globalIndex = new SearchIndex(globalStore.path, globalStore, embeddingProvider, config.hybridAlpha);
        await globalIndex.rebuild();
      }
    } catch {
      // Global search not available
    }
  }

  // Search
  const repoResults = await searchIndex.search(query, options.category, limit, explain);
  const globalResults = globalIndex ? await globalIndex.search(query, options.category, limit, explain) : [];

  // Merge with repo-first dedup
  const seen = new Set<string>();
  type TaggedResult = ExplainedSearchResult & { source: string };
  const merged: TaggedResult[] = [];

  for (const r of repoResults) {
    const key = `${r.category}/${r.filename}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push({ ...r, source: "repo" });
    }
  }
  for (const r of globalResults) {
    const key = `${r.category}/${r.filename}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push({ ...r, source: "global" });
    }
  }
  merged.sort((a, b) => b.score - a.score);
  const results = merged.slice(0, limit);

  if (results.length === 0) {
    console.log(chalk.yellow(`No results for "${query}".`));
    process.exit(0);
  }

  console.log(chalk.bold(`\n${results.length} result${results.length === 1 ? "" : "s"} for "${query}"\n`));

  for (const r of results) {
    const sourceTag = globalIndex ? chalk.dim(` [${r.source}]`) : "";
    const score = chalk.dim(`(${r.score.toFixed(2)})`);
    const path = chalk.cyan(`${r.category}/${r.filename}`);

    if (detail === "full") {
      console.log(`${path}${sourceTag} ${score}`);
      console.log(chalk.bold(`  ${r.title}`));
      if (explain && r.explain) {
        const e = r.explain;
        console.log(
          chalk.dim(
            `  [${e.method}] keyword=${e.keywordScore.toFixed(3)} semantic=${e.semanticScore.toFixed(3)} hybrid=${e.hybridScore.toFixed(3)}`
          )
        );
      }
      console.log(chalk.dim("  " + "\u2500".repeat(60)));
      const lines = r.snippet.split("\n").slice(0, 15);
      for (const line of lines) {
        console.log(`  ${line}`);
      }
      console.log();
    } else {
      const snippet = r.snippet.replace(/\n/g, " ").slice(0, 120);
      console.log(`  ${path}${sourceTag} ${score}`);
      if (explain && r.explain) {
        const e = r.explain;
        console.log(chalk.dim(`    [${e.method}] kw=${e.keywordScore.toFixed(2)} sem=${e.semanticScore.toFixed(2)}`));
      }
      console.log(`    ${chalk.bold(r.title)} \u2014 ${chalk.dim(snippet)}`);
    }
  }

  // Cleanup
  searchIndex.close();
  if (globalIndex) globalIndex.close();
}
