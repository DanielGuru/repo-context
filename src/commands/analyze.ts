import chalk from "chalk";
import { join } from "path";
import { loadConfig } from "../lib/config.js";
import type { Provider } from "../lib/config.js";
import { ContextStore } from "../lib/context-store.js";
import { SearchIndex } from "../lib/search.js";
import { scanRepo } from "../lib/repo-scanner.js";
import { getGitInfo, getRecentDiffs } from "../lib/git.js";
import { createProvider, validateApiKey, estimateCost, AIError } from "../lib/ai-provider.js";
import { extractJSON } from "../lib/json-repair.js";

interface AnalysisResult {
  index: string;
  facts: { filename: string; content: string }[];
  decisions: { filename: string; content: string }[];
  regressions: { filename: string; content: string }[];
  preferences?: { filename: string; content: string }[];
}

const ANALYSIS_SYSTEM_PROMPT = `You are repomemory, an expert codebase analyst. You create structured knowledge bases that AI coding agents (Claude Code, Cursor, Copilot, etc.) use to be immediately productive in unfamiliar codebases.

Frame every line you write as: "If I were an AI agent dropped into this codebase tomorrow with zero context, what would prevent me from making mistakes and wasting time?" Every sentence must either prevent a mistake or save time. Cut everything else.

Output valid JSON with this exact structure:
{
  "index": "markdown — the 30-second orientation cheat sheet",
  "facts": [{"filename": "kebab-case-name", "content": "markdown"}],
  "decisions": [{"filename": "kebab-case-name", "content": "markdown"}],
  "regressions": [{"filename": "kebab-case-name", "content": "markdown"}],
  "preferences": [{"filename": "kebab-case-name", "content": "markdown"}]
}

---

INDEX.md — The 30-Second Cheat Sheet (30-60 lines)

The first thing any agent reads. Structure it as:
1. What is this? — One sentence. Not marketing copy, not a README summary.
2. Stack — Bullet list of core technologies (language, framework, database, deployment target)
3. Commands — Exact commands to dev, test, build, deploy, lint. Copy-paste ready.
4. Structure — What lives in each top-level directory (3-5 bullet points)
5. Critical warnings — Things that WILL break or cause confusion if an agent doesn't know them
6. Active work — What's being worked on now (infer from recent commits/branches)

Write the things that AREN'T obvious from package.json or README — the tribal knowledge a senior dev tells you on day one. Use bullet lists and code blocks, not paragraphs. An agent should scan this in 10 seconds and know where to look for anything.

---

FACTS — How Things Actually Work (one file per concern, 20-80 lines)

Create files for the architectural concerns that matter for THIS specific repo. Don't force template names — a CLI tool needs different facts than a web app.

Examples: auth-flow, database-schema, api-routing, build-pipeline, state-management, deployment, monorepo-structure, testing-patterns, styling-and-theming, error-handling, data-fetching, caching-strategy

Each fact file MUST:
- Ground every claim in exact file paths and function/component names
- Explain how things connect and flow, not just what exists
- Include exact commands, config values, environment variable names
- Focus on what an agent needs to MODIFY code safely, not just understand it

For frontend/UI projects, ALWAYS document:
- Styling approach: CSS framework, utility classes, theme system, design tokens
- Global styles: where they live, CSS variables, color/spacing scales, dark mode
- Component patterns: how components are structured, shared layouts, common props

GOOD: "Auth uses JWT in httpOnly cookies. Refresh logic: \`src/auth/refresh.ts:handleRefresh()\`. Middleware at \`src/middleware/auth.ts\` validates every request. Tokens expire in 15min (see \`TOKEN_EXPIRY\` in \`src/config/auth.ts\`). To test locally: \`npm run dev\` then POST to /api/auth/login."

BAD: "The project uses JWT for authentication. JWT is a standard for secure token-based auth."

---

DECISIONS — Why Things Are This Way (one per decision)

ONLY document decisions with CONCRETE EVIDENCE from the codebase: config choices, code comments, commit messages, or patterns that reveal a deliberate choice over alternatives.

Each decision MUST include:
- What was decided (specific, not "we use X")
- Evidence (cite the file, comment, config, or pattern)
- Implication (what an agent should or shouldn't do because of this)

GOOD: "Drizzle ORM over Prisma — Evidence: drizzle.config.ts exists, comment in src/db/index.ts says 'Migrated from Prisma for edge runtime support'. Implication: Schema changes go through drizzle-kit generate, not Prisma migrate."

BAD: "React was chosen for its large ecosystem and component model." (Speculation — zero evidence for WHY.)

Rule: If the only evidence is "they use X" — that belongs in FACTS, not DECISIONS. Don't invent rationale. If you can't find decisions with real evidence, return an empty array.

---

REGRESSIONS — Active Gotchas Only

STRICT temporal rules — violating these produces useless, misleading output:
1. ONLY include issues that exist in the CURRENT source code right now
2. A TODO/FIXME/HACK counts ONLY if it's in the current source files you were given
3. A past bugfix commit is NOT a regression — the bug was fixed, it's history
4. Only document a fragile pattern if the fragile code STILL EXISTS today
5. A commit message saying "fix X" means X is FIXED — do not list it as a regression

Each regression MUST include:
- The specific gotcha (what breaks and when)
- Exact file paths where the fragile code lives
- How to avoid triggering it
- Symptoms when it happens (error messages, unexpected behavior)

If there are no active unresolved issues, return an EMPTY array. Zero honest entries is infinitely better than five stale ones that mislead agents into solving already-fixed problems.

---

PREFERENCES — Coding Style & Conventions (evidence-based)

Only include preferences backed by EVIDENCE from:
- Config files: .eslintrc, .prettierrc, biome.json, tsconfig.json, .editorconfig, stylelint, tailwind.config
- Consistent patterns visible across 3+ files

Cover what's actually evidenced: naming conventions, import ordering, formatting rules, error handling patterns, test structure, component patterns, CSS methodology, file organization.

If the repo has no style configs and inconsistent patterns, return an empty array.

---

QUALITY RULES

- 3 excellent entries > 10 generic entries. Omit rather than pad.
- Every file must have enough substance to change how an agent works. If a topic is too thin, merge it into a related file.
- Index POINTS to topics. Facts EXPLAIN them. Never duplicate content between them.
- Cross-reference between entries: "See decisions/orm-choice.md" or "See facts/auth-flow.md"
- Filenames: kebab-case, lowercase, descriptive — "auth-jwt-flow", "database-schema", "why-drizzle". NOT "Authentication Flow" or "Database Overview".

DON'T:
- Don't state things obvious from package.json ("uses TypeScript and React")
- Don't speculate about motivations without evidence
- Don't document old resolved bugs as current regressions
- Don't write prose paragraphs when bullet lists work
- Don't include version numbers that go stale immediately
- Don't create files with fewer than 10 lines of real content
- Don't parrot the README — write the knowledge that ISN'T in the README
- Don't fill categories for the sake of completeness — empty is honest

CRITICAL: Output ONLY the JSON object. No markdown wrapping, no \`\`\`json fences, no text before or after. Start with { and end with }. All markdown formatting goes INSIDE the JSON string values (escaped). Do NOT use actual newlines in string values — use \\n instead.`;

export async function analyzeCommand(options: {
  dir?: string;
  provider?: string;
  model?: string;
  verbose?: boolean;
  dryRun?: boolean;
  merge?: boolean;
}) {
  const repoRoot = options.dir || process.cwd();
  const config = loadConfig(repoRoot);

  if (options.provider) config.provider = options.provider as Provider;
  if (options.model) config.model = options.model;

  // Validate API key before doing any expensive work (skip for dry-run)
  const hasKey = options.dryRun || await validateApiKey(config);
  if (!hasKey) {
    const envVar = {
      anthropic: "ANTHROPIC_API_KEY",
      openai: "OPENAI_API_KEY",
      gemini: "GEMINI_API_KEY",
      grok: "GROK_API_KEY",
    }[config.provider];

    console.error(chalk.red(`\n\u2717 No API key found for ${config.provider}.`));
    console.error(chalk.dim(`  Set ${envVar} and try again.`));
    process.exit(1);
  }

  const store = new ContextStore(repoRoot, config);

  if (!store.exists()) {
    console.log(chalk.yellow("\u26a0  No .context/ directory found. Initializing..."));
    store.scaffold();
  }

  // Check merge mode
  const existingEntries = options.merge ? store.listEntries() : [];
  if (options.merge && existingEntries.length > 0) {
    console.log(chalk.dim(`  Merge mode: ${existingEntries.length} existing entries will be preserved.`));
  }

  console.log(chalk.bold("\n\ud83d\udd0d Scanning repository...\n"));

  const scan = scanRepo(repoRoot, config);
  console.log(`  ${chalk.cyan("Files:")} ${scan.stats.totalFiles}`);
  console.log(`  ${chalk.cyan("Directories:")} ${scan.stats.totalDirs}`);
  console.log(
    `  ${chalk.cyan("Languages:")} ${Object.entries(scan.stats.languages)
      .sort((a, b) => b[1] - a[1])
      .map(([lang, count]) => `${lang} (${count})`)
      .join(", ")}`
  );
  if (scan.stats.frameworks.length > 0) {
    console.log(`  ${chalk.cyan("Frameworks:")} ${scan.stats.frameworks.join(", ")}`);
  }
  console.log(`  ${chalk.cyan("Key files found:")} ${scan.keyFiles.length}`);

  console.log(chalk.bold("\n\ud83d\udcdc Reading git history...\n"));
  const git = getGitInfo(repoRoot, config.maxGitCommits);

  if (git.isGitRepo) {
    console.log(`  ${chalk.cyan("Commits:")} ${git.totalCommits}`);
    console.log(`  ${chalk.cyan("Contributors:")} ${git.contributors.length}`);
    console.log(`  ${chalk.cyan("Activity:")} ${git.commitFrequency}`);
    console.log(`  ${chalk.cyan("Branch:")} ${git.currentBranch}`);
  } else {
    console.log(chalk.dim("  Not a git repository"));
  }

  const recentDiffs = git.isGitRepo ? getRecentDiffs(repoRoot, 20) : "";
  const userPrompt = buildAnalysisPrompt(scan, git, recentDiffs, options.merge ? existingEntries : undefined);

  // Estimate tokens and cost
  const estimatedInputTokens = Math.round(userPrompt.length / 4) + 2000; // +2000 for system prompt
  const estimatedOutputTokens = 32000;
  const cost = estimateCost(config.provider, config.model, estimatedInputTokens, estimatedOutputTokens);

  console.log(chalk.dim(`\n  Estimated input: ~${estimatedInputTokens.toLocaleString()} tokens`));
  console.log(chalk.dim(`  Estimated cost: ${cost}`));

  // Dry run mode
  if (options.dryRun) {
    console.log(chalk.bold("\n\ud83d\udccb Dry run complete.\n"));
    console.log(`  Would analyze with ${chalk.cyan(config.provider)} (${config.model})`);
    console.log(`  Prompt size: ~${Math.round(userPrompt.length / 4).toLocaleString()} tokens`);
    console.log(`  Key files to analyze: ${scan.keyFiles.length}`);
    console.log(`  Estimated cost: ${cost}`);
    if (options.verbose) {
      console.log(chalk.dim("\n  Files that would be analyzed:"));
      for (const f of scan.keyFiles.slice(0, 20)) {
        console.log(chalk.dim(`    ${f.path}`));
      }
      if (scan.keyFiles.length > 20) {
        console.log(chalk.dim(`    ... and ${scan.keyFiles.length - 20} more`));
      }
    }
    return;
  }

  // Call AI with retry
  console.log(chalk.bold(`\n\ud83e\udd16 Analyzing with ${config.provider} (${config.model})...\n`));

  const ora = (await import("ora")).default;
  const spinner = ora({
    text: "Analyzing codebase...",
    color: "cyan",
  }).start();

  const provider = await createProvider(config);
  let response;
  const maxRetries = 2;
  const startTime = Date.now();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      response = await provider.generate(
        [
          { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        { maxTokens: 64000, temperature: 0.2 }
      );
      break;
    } catch (err) {
      const isRetryable = err instanceof AIError && err.isRetryable;
      if (attempt < maxRetries && isRetryable) {
        const delay = Math.pow(2, attempt + 1) * 1000;
        spinner.text = `Retrying in ${delay / 1000}s (attempt ${attempt + 2}/${maxRetries + 1})...`;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      spinner.fail("Analysis failed");
      throw err;
    }
  }

  if (!response) {
    spinner.fail("Analysis failed after retries");
    process.exit(1);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  spinner.succeed(`Analysis complete in ${elapsed}s`);

  if (response.tokensUsed) {
    const actualCost = estimateCost(
      config.provider,
      config.model,
      response.inputTokens || 0,
      response.outputTokens || 0
    );
    console.log(chalk.dim(`  Tokens: ${response.tokensUsed.toLocaleString()} | Cost: ${actualCost}`));
  }

  // Parse response
  let analysis: AnalysisResult;
  try {
    analysis = extractJSON(response.content);
  } catch (e) {
    const debugPath = join(repoRoot, ".context", ".last-response.txt");
    try {
      const { writeFileSync: wf } = await import("fs");
      wf(debugPath, response.content);
      console.error(chalk.dim(`  Raw response saved to ${debugPath}`));
    } catch {}

    console.error(chalk.red(`\n\u2717 Failed to parse AI response as JSON: ${(e as Error).message}`));
    if (options.verbose) {
      console.error(chalk.dim(response.content.slice(0, 500)));
    }
    console.log(chalk.yellow("\nTip: Try running again, or try a different model with --model"));
    process.exit(1);
  }

  // Write everything
  console.log(chalk.bold("\n\ud83d\udcdd Writing context files...\n"));

  // In merge mode, only overwrite index, add new facts/decisions/regressions
  if (!options.merge) {
    store.writeIndex(analysis.index);
    console.log(`  ${chalk.green("\u2713")} index.md`);
  } else {
    // In merge mode, append new info to index
    const existingIndex = store.readIndex();
    if (!existingIndex || existingIndex.includes("Run `repomemory analyze` to populate")) {
      store.writeIndex(analysis.index);
      console.log(`  ${chalk.green("\u2713")} index.md (replaced placeholder)`);
    } else {
      console.log(`  ${chalk.yellow("\u2192")} index.md (preserved existing)`);
    }
  }

  const existingFilenames = new Set(existingEntries.map((e) => `${e.category}/${e.filename}`));

  for (const fact of analysis.facts || []) {
    const key = `facts/${fact.filename.toLowerCase().replace(/[^a-z0-9._-]/g, "-")}.md`;
    if (options.merge && existingFilenames.has(key)) {
      console.log(`  ${chalk.yellow("\u2192")} ${key} (preserved existing)`);
      continue;
    }
    const path = store.writeEntry("facts", fact.filename, fact.content);
    console.log(`  ${chalk.green("\u2713")} ${path}`);
  }

  for (const decision of analysis.decisions || []) {
    const key = `decisions/${decision.filename.toLowerCase().replace(/[^a-z0-9._-]/g, "-")}.md`;
    if (options.merge && existingFilenames.has(key)) {
      console.log(`  ${chalk.yellow("\u2192")} ${key} (preserved existing)`);
      continue;
    }
    const path = store.writeEntry("decisions", decision.filename, decision.content);
    console.log(`  ${chalk.green("\u2713")} ${path}`);
  }

  for (const regression of analysis.regressions || []) {
    const key = `regressions/${regression.filename.toLowerCase().replace(/[^a-z0-9._-]/g, "-")}.md`;
    if (options.merge && existingFilenames.has(key)) {
      console.log(`  ${chalk.yellow("\u2192")} ${key} (preserved existing)`);
      continue;
    }
    const path = store.writeEntry("regressions", regression.filename, regression.content);
    console.log(`  ${chalk.green("\u2713")} ${path}`);
  }

  for (const preference of analysis.preferences || []) {
    const key = `preferences/${preference.filename.toLowerCase().replace(/[^a-z0-9._-]/g, "-")}.md`;
    if (options.merge && existingFilenames.has(key)) {
      console.log(`  ${chalk.yellow("\u2192")} ${key} (preserved existing)`);
      continue;
    }
    const path = store.writeEntry("preferences", preference.filename, preference.content);
    console.log(`  ${chalk.green("\u2713")} ${path}`);
  }

  // Build search index
  const spinnerIndex = ora({ text: "Building search index...", color: "cyan" }).start();
  const searchIndex = new SearchIndex(store.path, store);
  await searchIndex.rebuild();
  searchIndex.close();
  spinnerIndex.succeed("Search index built");

  // Coverage report
  const stats = store.getStats();
  const factsCount = (analysis.facts || []).length;
  const decisionsCount = (analysis.decisions || []).length;
  const regressionsCount = (analysis.regressions || []).length;
  const preferencesCount = (analysis.preferences || []).length;

  console.log(chalk.bold("\n\u2728 Analysis complete!\n"));

  // Beautiful coverage bars
  printCoverageBar("Facts", factsCount, 8);
  printCoverageBar("Decisions", decisionsCount, 5);
  printCoverageBar("Regressions", regressionsCount, 3);
  printCoverageBar("Preferences", preferencesCount, 2);

  console.log(
    chalk.dim(`\n  Total: ${stats.totalFiles} files | ${(stats.totalSize / 1024).toFixed(1)}KB\n`)
  );

  console.log(chalk.bold("Next:"));
  console.log(`  ${chalk.dim("\u2022")} Review .context/ files and edit as needed`);
  console.log(`  ${chalk.dim("\u2022")} Run ${chalk.cyan("repomemory setup claude")} to connect your AI tool`);
  console.log(`  ${chalk.dim("\u2022")} Run ${chalk.cyan("repomemory analyze --merge")} to update without overwriting`);
  console.log(`  ${chalk.dim("\u2022")} Commit .context/ to git to share with your team`);
}

function printCoverageBar(label: string, count: number, max: number): void {
  const filled = Math.min(count, max);
  const percentage = Math.min(100, Math.round((count / max) * 100));
  const barLength = 20;
  const filledLength = Math.round((filled / max) * barLength);

  let color = chalk.green;
  if (percentage < 40) color = chalk.red;
  else if (percentage < 70) color = chalk.yellow;

  const bar = color("\u2588".repeat(filledLength)) + chalk.dim("\u2591".repeat(barLength - filledLength));
  const label_ = label.padEnd(12);
  console.log(`  ${label_} ${bar} ${percentage}%  (${count} files)`);
}

function buildAnalysisPrompt(
  scan: ReturnType<typeof scanRepo>,
  git: ReturnType<typeof getGitInfo>,
  recentDiffs: string,
  existingEntries?: Array<{ category: string; filename: string; title: string }>
): string {
  const parts: string[] = [];

  // Date context — critical for temporal filtering of regressions
  const today = new Date().toISOString().split("T")[0];
  parts.push(`## Analysis Context`);
  parts.push(`Today's date: ${today}`);
  parts.push(`Use this to judge recency. Only recent, unresolved issues belong in regressions.`);

  // Stack-aware hints
  if (scan.stats.frameworks.length > 0) {
    parts.push(`\nDetected stack: ${scan.stats.frameworks.join(", ")}`);
    const hints = getFrameworkHints(scan.stats.frameworks);
    if (hints) {
      parts.push(`Analysis focus areas for this stack: ${hints}`);
    }
  }

  parts.push("\n## Repository Structure\n```");
  parts.push(scan.tree.slice(0, 5000));
  parts.push("```");

  parts.push("\n## Repository Stats");
  parts.push(`- Files: ${scan.stats.totalFiles}`);
  parts.push(`- Languages: ${JSON.stringify(scan.stats.languages)}`);
  parts.push(`- Frameworks: ${scan.stats.frameworks.join(", ") || "none detected"}`);
  parts.push(`- Package managers: ${scan.stats.packageManagers.join(", ") || "none detected"}`);
  parts.push(`- Monorepo: ${scan.stats.hasMonorepo}`);

  parts.push("\n## Key Files\n");
  for (const file of scan.keyFiles) {
    parts.push(`### ${file.path}\n\`\`\`\n${file.content.slice(0, 8000)}\n\`\`\`\n`);
  }

  if (git.isGitRepo) {
    parts.push("\n## Git Information");
    parts.push(`- Total commits: ${git.totalCommits}`);
    parts.push(`- Activity: ${git.commitFrequency}`);
    parts.push(`- Default branch: ${git.defaultBranch}`);
    parts.push(`- Contributors: ${git.contributors.map((c) => `${c.name} (${c.commits})`).join(", ")}`);

    if (git.recentCommits.length > 0) {
      // Show time span so the AI can judge recency
      const newest = git.recentCommits[0].date.split("T")[0];
      const oldest = git.recentCommits[git.recentCommits.length - 1].date.split("T")[0];

      parts.push(`\n### Recent Commits (${oldest} to ${newest})`);
      parts.push(`IMPORTANT: These commits are historical context for understanding the project. A commit that says "fix X" means X was ALREADY FIXED — do NOT document it as an active regression.`);
      for (const commit of git.recentCommits.slice(0, 50)) {
        parts.push(
          `- ${commit.shortHash} ${commit.message} (${commit.author}, ${commit.date.split("T")[0]}, +${commit.insertions}/-${commit.deletions})`
        );
      }
    }

    if (recentDiffs) {
      parts.push("\n### Recent Change Summaries");
      parts.push("```");
      parts.push(recentDiffs.slice(0, 5000));
      parts.push("```");
    }
  }

  // If merge mode, tell the AI what already exists
  if (existingEntries && existingEntries.length > 0) {
    parts.push("\n## Existing Context (DO NOT duplicate these — create NEW entries for uncovered areas)");
    for (const entry of existingEntries) {
      if (entry.category !== "root") {
        parts.push(`- ${entry.category}/${entry.filename}: ${entry.title}`);
      }
    }
  }

  return parts.join("\n");
}

/** Returns stack-specific analysis hints based on detected frameworks */
function getFrameworkHints(frameworks: string[]): string {
  const hints: string[] = [];
  const fw = new Set(frameworks);

  // Frontend frameworks
  if (fw.has("Next.js")) hints.push("routing conventions (App Router vs Pages Router), API routes, SSR/SSG patterns, middleware");
  else if (fw.has("Nuxt")) hints.push("file-based routing, server routes, auto-imports, composables");
  else if (fw.has("Remix")) hints.push("loader/action patterns, nested routes, data fetching");
  else if (fw.has("React")) hints.push("component patterns, state management, routing approach");
  else if (fw.has("Vue")) hints.push("component patterns, Composition API vs Options API, state management");
  else if (fw.has("Svelte")) hints.push("component patterns, stores, reactivity model");
  else if (fw.has("Angular")) hints.push("module structure, services, dependency injection, routing");
  else if (fw.has("Astro")) hints.push("island architecture, content collections, SSG patterns");

  // Styling & UI libraries
  if (fw.has("Tailwind CSS")) hints.push("Tailwind config, custom theme/design tokens, global CSS, dark mode strategy, utility patterns");
  if (fw.has("Styled Components") || fw.has("Emotion")) hints.push("theme provider, design tokens, global styles, CSS-in-JS patterns");
  if (fw.has("Material UI")) hints.push("theme customization, component overrides, sx prop patterns");
  if (fw.has("Chakra UI")) hints.push("theme config, custom components, style props");
  if (fw.has("Radix UI") || fw.has("shadcn/ui")) hints.push("component primitives, styling approach, theme/CSS variables");

  // ORMs
  if (fw.has("Drizzle ORM")) hints.push("schema location, migration workflow, query patterns");
  else if (fw.has("Prisma")) hints.push("schema.prisma location, migration workflow, client generation");

  // Backend frameworks
  if (fw.has("Express")) hints.push("middleware chain, route organization, error handling");
  else if (fw.has("Fastify")) hints.push("plugin system, schema validation, route structure");
  else if (fw.has("Hono")) hints.push("middleware, routing, edge deployment targets");

  // Rust
  if (fw.has("Axum") || fw.has("Actix")) hints.push("handler patterns, middleware/extractors, error handling");

  // Workers
  if (fw.has("Cloudflare Workers")) hints.push("wrangler config, bindings (KV/D1/R2), edge runtime constraints");

  return hints.join("; ");
}
