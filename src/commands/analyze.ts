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

const ANALYSIS_SYSTEM_PROMPT = `You are repomemory, an expert at analyzing codebases and creating structured knowledge bases for AI coding agents.

Your job is to analyze a repository and produce a comprehensive, well-organized knowledge base that helps AI agents (Claude Code, Cursor, Copilot, etc.) work effectively in this codebase from the very first message.

You must output valid JSON with this exact structure:
{
  "index": "markdown string for index.md - the 30-60 line quick orientation",
  "facts": [
    {"filename": "descriptive-name.md", "content": "markdown content"}
  ],
  "decisions": [
    {"filename": "descriptive-name.md", "content": "markdown content"}
  ],
  "regressions": [
    {"filename": "descriptive-name.md", "content": "markdown content"}
  ],
  "preferences": [
    {"filename": "descriptive-name.md", "content": "markdown content"}
  ]
}

Guidelines for each section:

INDEX.md (30-60 lines):
- What this project is (1-2 sentences)
- Tech stack and key frameworks
- Service architecture (if multiple services/packages)
- Key file locations (config, schema, entry points)
- Active development areas
- Critical warnings for agents (things that WILL bite you)
- How to run/test/deploy

FACTS (one file per architectural concern, 20-80 lines each):
- architecture.md — Services, how they connect, deployment targets
- database.md — Schema overview, key tables, relationships
- deployment.md — How to deploy each service, env vars needed
- api-patterns.md — How APIs are structured, auth, common patterns
- testing.md — How to run tests, what frameworks, coverage
- Create additional files for any major subsystem (auth, billing, etc.)

DECISIONS (one file per significant decision):
- Format: What was decided, Why, Alternatives considered, Date (if inferrable)
- Only document decisions you can confidently infer from the code
- Examples: tech stack choices, architecture patterns, naming conventions

REGRESSIONS (one file per known issue pattern):
- Format: What happened, Root cause, How it was fixed, How to prevent it
- Look for: TODO/FIXME/HACK comments, recent bugfix commits, workaround patterns
- Only include if you have reasonable confidence

PREFERENCES (inferred coding style, optional — omit if not confidently inferrable):
- Look for: linter configs (.eslintrc, .prettierrc), tsconfig strict settings, naming conventions in code
- Format: What the preference is, evidence from codebase
- Examples: "Prefers functional components", "Uses barrel exports", "TypeScript strict mode"
- Only include if clearly evidenced by config files or consistent patterns

Rules:
- Be specific — include file paths, function names, exact commands
- Be concise — no filler, every line should inform a decision
- Use code blocks for commands, configs, and code references
- Link between files where relevant (e.g., "See decisions/tech-stack.md")
- If the repo has an existing CLAUDE.md or similar, extract and restructure its knowledge
- Focus on what an AI agent needs to be PRODUCTIVE, not just informed

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

  parts.push("## Repository Structure\n```");
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
      parts.push("\n### Recent Commits");
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
