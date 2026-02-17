import chalk from "chalk";
import { join } from "path";
import { loadConfig } from "../lib/config.js";
import { ContextStore } from "../lib/context-store.js";
import { SearchIndex } from "../lib/search.js";
import { scanRepo } from "../lib/repo-scanner.js";
import { getGitInfo, getRecentDiffs } from "../lib/git.js";
import { createProvider } from "../lib/ai-provider.js";

/**
 * Robustly extracts a JSON object from an AI response that may contain
 * markdown code fences, preamble text, or other wrapping.
 */
function extractJSON(raw: string): {
  index: string;
  facts: { filename: string; content: string }[];
  decisions: { filename: string; content: string }[];
  regressions: { filename: string; content: string }[];
} {
  let text = raw.trim();

  // Strategy 1: Strip outermost code fences (greedy to match last ```)
  const fenceMatch = text.match(/^```(?:json)?\s*\n([\s\S]*)\n\s*```\s*$/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  // Strategy 2: If still wrapped in non-JSON text, find first { to last }
  if (!text.startsWith("{")) {
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      text = text.slice(firstBrace, lastBrace + 1);
    }
  }

  // Try parsing (with multiple repair strategies)
  const attempts: (() => string)[] = [
    () => text,
    () => fixJsonNewlines(text),
    () => repairTruncatedJSON(text),
    () => repairTruncatedJSON(fixJsonNewlines(text)),
  ];

  let lastError: Error | null = null;
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt());
    } catch (e) {
      lastError = e as Error;
    }
  }

  throw lastError;
}

/**
 * Fixes actual newlines inside JSON string values by replacing them with \n.
 * Walks the string character by character, tracking whether we're inside a string.
 */
function fixJsonNewlines(json: string): string {
  const chars: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < json.length; i++) {
    const ch = json[i];

    if (escaped) {
      chars.push(ch);
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      chars.push(ch);
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      chars.push(ch);
      continue;
    }

    if (inString && ch === "\n") {
      chars.push("\\n");
      continue;
    }

    if (inString && ch === "\r") {
      continue; // Skip carriage returns
    }

    if (inString && ch === "\t") {
      chars.push("\\t");
      continue;
    }

    chars.push(ch);
  }

  return chars.join("");
}

/**
 * Repairs a truncated JSON string by closing any open strings, arrays, and objects.
 * Handles the common case where the AI response was cut off mid-output.
 */
function repairTruncatedJSON(json: string): string {
  let text = json.trim();

  // If it ends cleanly, nothing to repair
  if (text.endsWith("}")) {
    try {
      JSON.parse(text);
      return text;
    } catch {
      // Fall through to repair
    }
  }

  // Find what's open — track nesting
  let inString = false;
  let escaped = false;
  const stack: string[] = []; // Track open brackets

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }

  // Close open string if needed
  if (inString) {
    text += '"';
  }

  // Remove trailing comma
  text = text.replace(/,\s*$/, "");

  // Close all open brackets in reverse order
  while (stack.length > 0) {
    const closer = stack.pop()!;
    // Remove any trailing incomplete entry before closing
    if (closer === "]") {
      // Remove trailing incomplete object in array
      text = text.replace(/,\s*\{[^}]*$/, "");
      text = text.replace(/,\s*"[^"]*$/, "");
    }
    text += closer;
  }

  return text;
}

const ANALYSIS_SYSTEM_PROMPT = `You are repo-context, an expert at analyzing codebases and creating structured knowledge bases for AI coding agents.

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
}) {
  const repoRoot = options.dir || process.cwd();
  const config = loadConfig(repoRoot);

  if (options.provider) config.provider = options.provider as typeof config.provider;
  if (options.model) config.model = options.model;

  const store = new ContextStore(repoRoot, config);

  if (!store.exists()) {
    console.log(chalk.yellow("⚠  No .context/ directory found. Running init first..."));
    store.scaffold();
  }

  console.log(chalk.bold("\n🔍 Scanning repository...\n"));

  // Scan repo
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

  // Get git info
  console.log(chalk.bold("\n📜 Reading git history...\n"));
  const git = getGitInfo(repoRoot, config.maxGitCommits);

  if (git.isGitRepo) {
    console.log(`  ${chalk.cyan("Commits:")} ${git.totalCommits}`);
    console.log(`  ${chalk.cyan("Contributors:")} ${git.contributors.length}`);
    console.log(`  ${chalk.cyan("Activity:")} ${git.commitFrequency}`);
    console.log(`  ${chalk.cyan("Branch:")} ${git.currentBranch}`);
  } else {
    console.log(chalk.dim("  Not a git repository"));
  }

  // Get recent diffs for deeper analysis
  const recentDiffs = git.isGitRepo ? getRecentDiffs(repoRoot, 20) : "";

  // Build the analysis prompt
  const userPrompt = buildAnalysisPrompt(scan, git, recentDiffs);

  if (options.verbose) {
    console.log(chalk.dim(`\n  Prompt size: ~${Math.round(userPrompt.length / 4)} tokens`));
  }

  // Call AI
  console.log(chalk.bold(`\n🤖 Analyzing with ${config.provider} (${config.model})...\n`));

  const provider = await createProvider(config);

  const startTime = Date.now();
  const response = await provider.generate(
    [
      { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    { maxTokens: 64000, temperature: 0.2 }
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(chalk.dim(`  Completed in ${elapsed}s`));
  if (response.tokensUsed) {
    console.log(chalk.dim(`  Tokens used: ${response.tokensUsed.toLocaleString()}`));
  }

  // Parse response
  let analysis: {
    index: string;
    facts: { filename: string; content: string }[];
    decisions: { filename: string; content: string }[];
    regressions: { filename: string; content: string }[];
  };

  try {
    analysis = extractJSON(response.content);
  } catch (e) {
    // Save raw response for debugging
    const debugPath = join(repoRoot, ".context", ".last-response.txt");
    try {
      const { writeFileSync: wf } = await import("fs");
      wf(debugPath, response.content);
      console.error(chalk.dim(`  Raw response saved to ${debugPath}`));
    } catch {}

    console.error(chalk.red(`\n✗ Failed to parse AI response as JSON: ${(e as Error).message}`));
    if (options.verbose) {
      console.error(chalk.dim(response.content.slice(0, 500)));
    }
    console.log(chalk.yellow("\nTip: Try running again, or try a different model with --model"));
    process.exit(1);
  }

  // Write everything
  console.log(chalk.bold("\n📝 Writing context files...\n"));

  // Index
  store.writeIndex(analysis.index);
  console.log(`  ${chalk.green("✓")} index.md`);

  // Facts
  for (const fact of analysis.facts || []) {
    const path = store.writeEntry("facts", fact.filename, fact.content);
    console.log(`  ${chalk.green("✓")} ${path}`);
  }

  // Decisions
  for (const decision of analysis.decisions || []) {
    const path = store.writeEntry("decisions", decision.filename, decision.content);
    console.log(`  ${chalk.green("✓")} ${path}`);
  }

  // Regressions
  for (const regression of analysis.regressions || []) {
    const path = store.writeEntry("regressions", regression.filename, regression.content);
    console.log(`  ${chalk.green("✓")} ${path}`);
  }

  // Build search index
  console.log(chalk.bold("\n🔎 Building search index...\n"));
  const searchIndex = new SearchIndex(store.path, store);
  searchIndex.rebuild();
  searchIndex.close();

  const stats = store.getStats();
  console.log(`  ${chalk.green("✓")} Indexed ${stats.totalFiles} files across ${Object.keys(stats.categories).length} categories`);

  // Summary
  console.log(chalk.bold("\n✨ Analysis complete!\n"));
  console.log(`  ${chalk.cyan("Facts:")} ${(analysis.facts || []).length} files`);
  console.log(`  ${chalk.cyan("Decisions:")} ${(analysis.decisions || []).length} files`);
  console.log(`  ${chalk.cyan("Regressions:")} ${(analysis.regressions || []).length} files`);
  console.log();
  console.log(chalk.bold("Next:"));
  console.log(`  ${chalk.dim("•")} Review .context/ files and edit as needed`);
  console.log(`  ${chalk.dim("•")} Run ${chalk.cyan("repo-context serve")} to start the MCP server`);
  console.log(`  ${chalk.dim("•")} Commit .context/ to git to share with your team`);
}

function buildAnalysisPrompt(
  scan: ReturnType<typeof scanRepo>,
  git: ReturnType<typeof getGitInfo>,
  recentDiffs: string
): string {
  const parts: string[] = [];

  // Project structure
  parts.push("## Repository Structure\n```");
  parts.push(scan.tree.slice(0, 5000)); // Cap tree size
  parts.push("```");

  // Stats
  parts.push("\n## Repository Stats");
  parts.push(`- Files: ${scan.stats.totalFiles}`);
  parts.push(`- Languages: ${JSON.stringify(scan.stats.languages)}`);
  parts.push(`- Frameworks: ${scan.stats.frameworks.join(", ") || "none detected"}`);
  parts.push(`- Package managers: ${scan.stats.packageManagers.join(", ") || "none detected"}`);
  parts.push(`- Monorepo: ${scan.stats.hasMonorepo}`);

  // Key files
  parts.push("\n## Key Files\n");
  for (const file of scan.keyFiles) {
    parts.push(`### ${file.path}\n\`\`\`\n${file.content.slice(0, 8000)}\n\`\`\`\n`);
  }

  // Git info
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

  return parts.join("\n");
}
