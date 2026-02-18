import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import chalk from "chalk";

export async function setupCommand(
  tool: string,
  options: { dir?: string }
) {
  const repoRoot = options.dir || process.cwd();

  switch (tool) {
    case "claude":
      return setupClaude(repoRoot);
    case "cursor":
      return setupCursor(repoRoot);
    case "copilot":
      return setupCopilot(repoRoot);
    default:
      console.log(chalk.red(`Unknown tool: ${tool}`));
      console.log(chalk.dim("Supported: claude, cursor, copilot"));
      process.exit(1);
  }
}

function setupClaude(repoRoot: string) {
  // Add MCP server to .claude/settings.json or project-level settings
  const claudeDir = join(repoRoot, ".claude");
  mkdirSync(claudeDir, { recursive: true });

  const settingsPath = join(claudeDir, "settings.json");
  let settings: Record<string, unknown> = {};

  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    } catch {
      // Start fresh
    }
  }

  // Add MCP server config
  const mcpServers = (settings.mcpServers || {}) as Record<string, unknown>;
  mcpServers["repomemory"] = {
    command: "npx",
    args: ["-y", "repomemory", "serve"],
  };
  settings.mcpServers = mcpServers;

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");

  // Also update CLAUDE.md to point to .context/
  const claudeMdPath = join(repoRoot, "CLAUDE.md");
  const contextNote = `\n## Repository Context\nThis repo uses [repomemory](https://github.com/repomemory/repomemory) for persistent AI memory.\nRead \`.context/index.md\` for instant orientation. The MCP server provides \`context_search\` and \`context_write\` tools.\n`;

  if (existsSync(claudeMdPath)) {
    const existing = readFileSync(claudeMdPath, "utf-8");
    if (!existing.includes("repomemory")) {
      writeFileSync(claudeMdPath, existing + contextNote);
      console.log(`  ${chalk.green("✓")} Updated CLAUDE.md with repomemory reference`);
    }
  }

  console.log(chalk.green("\n✓ Claude Code configured!\n"));
  console.log(chalk.bold("Added to .claude/settings.json:"));
  console.log(chalk.dim(JSON.stringify({ "repomemory": mcpServers["repomemory"] }, null, 2)));
  console.log();
  console.log(
    chalk.dim("The MCP server will auto-start when Claude Code opens this project.")
  );
}

function setupCursor(repoRoot: string) {
  // Create .cursor/rules/repomemory.mdc
  const cursorDir = join(repoRoot, ".cursor", "rules");
  mkdirSync(cursorDir, { recursive: true });

  const ruleContent = `---
description: Repository context and memory system
globs: **/*
---

# Repository Context

This project uses repomemory for persistent AI memory.

## Quick Orientation
Read \`.context/index.md\` for immediate project understanding.

## Before Making Changes
- Search \`.context/facts/\` for architecture documentation
- Check \`.context/decisions/\` before proposing alternative approaches
- Review \`.context/regressions/\` before touching fragile code

## During Your Session
- Document important discoveries in \`.context/sessions/\`
- If you find a bug pattern, note it in \`.context/regressions/\`
- If you make an architectural decision, record it in \`.context/decisions/\`

## Context Files
\`\`\`
.context/
├── index.md          — Quick orientation
├── facts/            — Architecture, patterns, integrations
├── decisions/        — Why things are this way
├── regressions/      — Known gotchas and past bugs
├── sessions/         — Session summaries
└── changelog/        — Monthly change logs
\`\`\`
`;

  writeFileSync(join(cursorDir, "repomemory.mdc"), ruleContent);

  console.log(chalk.green("\n✓ Cursor configured!\n"));
  console.log(`  ${chalk.green("✓")} Created .cursor/rules/repomemory.mdc`);
  console.log();
  console.log(chalk.dim("Cursor will auto-load the repomemory rule for all files."));
}

function setupCopilot(repoRoot: string) {
  // Create .github/copilot-instructions.md addition
  const githubDir = join(repoRoot, ".github");
  mkdirSync(githubDir, { recursive: true });

  const instructionsPath = join(githubDir, "copilot-instructions.md");
  const content = `# Repository Context

This project uses repomemory for persistent AI memory.

## Before Starting Work
1. Read \`.context/index.md\` for project orientation
2. Check \`.context/facts/\` for relevant architecture docs
3. Review \`.context/decisions/\` before proposing alternatives
4. Check \`.context/regressions/\` for known issues

## Context Structure
- \`.context/facts/\` — Architecture, patterns, integrations
- \`.context/decisions/\` — Architectural decisions with rationale
- \`.context/regressions/\` — Known issues and past bugs
- \`.context/sessions/\` — AI session summaries
- \`.context/changelog/\` — Monthly change logs
`;

  let existing = "";
  if (existsSync(instructionsPath)) {
    existing = readFileSync(instructionsPath, "utf-8");
    if (existing.includes("repomemory")) {
      console.log(chalk.yellow("⚠  copilot-instructions.md already references repomemory"));
      return;
    }
  }

  writeFileSync(instructionsPath, existing + "\n" + content);

  console.log(chalk.green("\n✓ GitHub Copilot configured!\n"));
  console.log(`  ${chalk.green("✓")} Updated .github/copilot-instructions.md`);
}
