import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from "fs";
import { join } from "path";
import chalk from "chalk";

const SUPPORTED_TOOLS = ["claude", "cursor", "copilot", "windsurf", "cline", "aider", "continue"];

export async function setupCommand(
  tool: string,
  options: { dir?: string }
) {
  const repoRoot = options.dir || process.cwd();

  if (!SUPPORTED_TOOLS.includes(tool)) {
    console.log(chalk.red(`Unknown tool: ${tool}`));
    console.log(chalk.dim(`Supported: ${SUPPORTED_TOOLS.join(", ")}`));
    process.exit(1);
  }

  switch (tool) {
    case "claude":
      return setupClaude(repoRoot);
    case "cursor":
      return setupCursor(repoRoot);
    case "copilot":
      return setupCopilot(repoRoot);
    case "windsurf":
      return setupWindsurf(repoRoot);
    case "cline":
      return setupCline(repoRoot);
    case "aider":
      return setupAider(repoRoot);
    case "continue":
      return setupContinue(repoRoot);
  }
}

function setupClaude(repoRoot: string) {
  // --- Part 1: Global MCP server in ~/.claude.json ---
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const configPath = join(homeDir, ".claude.json");

  let config: Record<string, unknown> = {};
  let mcpAlreadyConfigured = false;

  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, "utf-8"));
    } catch {
      console.log(chalk.red("\u2717 Could not parse ~/.claude.json. Is Claude Code installed?"));
      process.exit(1);
    }
  } else {
    console.log(chalk.red("\u2717 ~/.claude.json not found. Install Claude Code first."));
    console.log(chalk.dim("  https://docs.anthropic.com/en/docs/claude-code"));
    process.exit(1);
  }

  const mcpServers = (config.mcpServers || {}) as Record<string, unknown>;

  if (mcpServers["repomemory"]) {
    mcpAlreadyConfigured = true;
  } else {
    mcpServers["repomemory"] = {
      type: "stdio",
      command: "npx",
      args: ["-y", "repomemory", "serve"],
      env: {},
    };
    config.mcpServers = mcpServers;
    writeFileSync(configPath, JSON.stringify(config, null, 2));
  }

  // --- Part 2: Project-level post-commit hook in .claude/settings.json ---
  const claudeDir = join(repoRoot, ".claude");
  const settingsPath = join(claudeDir, "settings.json");

  let projectSettings: Record<string, unknown> = {};
  let hookAlreadyConfigured = false;

  if (existsSync(settingsPath)) {
    try {
      projectSettings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    } catch {
      // Malformed — start fresh
    }
  }

  // Check if hook already exists
  const existingHooks = projectSettings.hooks as Record<string, unknown[]> | undefined;
  if (existingHooks?.PostToolUse) {
    const hasRepomemoryHook = JSON.stringify(existingHooks.PostToolUse).includes("repomemory");
    if (hasRepomemoryHook) {
      hookAlreadyConfigured = true;
    }
  }

  if (!hookAlreadyConfigured) {
    mkdirSync(claudeDir, { recursive: true });

    // Write hook script
    const hooksDir = join(claudeDir, "hooks");
    mkdirSync(hooksDir, { recursive: true });
    const hookScriptPath = join(hooksDir, "post-commit-context.sh");

    if (!existsSync(hookScriptPath)) {
      const hookScript = `#!/bin/bash
# repomemory: remind agent to record context after git commits
# Installed by: repomemory setup claude

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

if [ -z "$COMMAND" ]; then
  exit 0
fi

if echo "$COMMAND" | grep -q "git commit"; then
  cat <<'REMINDER'
You just committed code. Before continuing, record what you learned using repomemory:
- Decisions made → context_write(category="decisions", ...)
- Bugs found or fixed → context_write(category="regressions", ...)
- Architecture learned → context_write(category="facts", ...)
REMINDER
fi

exit 0
`;
      writeFileSync(hookScriptPath, hookScript);
      chmodSync(hookScriptPath, "755");
    }

    const postToolUseHook = {
      matcher: "Bash",
      hooks: [
        {
          type: "command",
          command: ".claude/hooks/post-commit-context.sh",
        },
      ],
    };

    if (!projectSettings.hooks) {
      projectSettings.hooks = {};
    }
    const hooks = projectSettings.hooks as Record<string, unknown[]>;
    if (!hooks.PostToolUse) {
      hooks.PostToolUse = [];
    }
    hooks.PostToolUse.push(postToolUseHook);

    writeFileSync(settingsPath, JSON.stringify(projectSettings, null, 2) + "\n");
  }

  // --- Output ---
  if (mcpAlreadyConfigured && hookAlreadyConfigured) {
    console.log(chalk.green("\n\u2713 Claude Code already configured with repomemory.\n"));
    console.log(chalk.dim(`  MCP server: ${configPath}`));
    console.log(chalk.dim(`  Post-commit hook: ${settingsPath}`));
    console.log(chalk.dim("  Restart Claude Code to pick up any changes."));
    return;
  }

  console.log(chalk.green("\n\u2713 Claude Code configured!\n"));

  if (!mcpAlreadyConfigured) {
    console.log(chalk.bold(`MCP server added to ${configPath}:`));
    console.log(chalk.dim(JSON.stringify({ "repomemory": mcpServers["repomemory"] }, null, 2)));
    console.log();
  }

  if (!hookAlreadyConfigured) {
    console.log(chalk.bold(`Post-commit hook added to ${settingsPath}`));
    console.log(chalk.dim("  After git commits, Claude will be reminded to record context."));
    console.log();
  }

  console.log(chalk.dim("Restart Claude Code to activate. The MCP server will auto-start in every project."));
  console.log(chalk.dim("In repos without .context/, the tools are inert (no noise, no errors)."));
  console.log();
  console.log(chalk.dim("Tools: context_search, context_write, context_read, context_list, context_delete, context_auto_orient"));
}

function setupCursor(repoRoot: string) {
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
- Record coding style preferences in \`.context/preferences/\`

## Context Files
\`\`\`
.context/
\u251c\u2500\u2500 index.md          \u2014 Quick orientation
\u251c\u2500\u2500 facts/            \u2014 Architecture, patterns, integrations
\u251c\u2500\u2500 decisions/        \u2014 Why things are this way
\u251c\u2500\u2500 regressions/      \u2014 Known gotchas and past bugs
\u251c\u2500\u2500 preferences/      \u2014 Coding style and preferred patterns
\u251c\u2500\u2500 sessions/         \u2014 Session summaries
\u2514\u2500\u2500 changelog/        \u2014 Monthly change logs
\`\`\`
`;

  writeFileSync(join(cursorDir, "repomemory.mdc"), ruleContent);

  console.log(chalk.green("\n\u2713 Cursor configured!\n"));
  console.log(`  ${chalk.green("\u2713")} Created .cursor/rules/repomemory.mdc`);
  console.log();
  console.log(chalk.dim("Cursor will auto-load the repomemory rule for all files."));
}

function setupCopilot(repoRoot: string) {
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
- \`.context/facts/\` \u2014 Architecture, patterns, integrations
- \`.context/decisions/\` \u2014 Architectural decisions with rationale
- \`.context/regressions/\` \u2014 Known issues and past bugs
- \`.context/preferences/\` \u2014 Coding style, preferred patterns
- \`.context/sessions/\` \u2014 AI session summaries
- \`.context/changelog/\` \u2014 Monthly change logs
`;

  let existing = "";
  if (existsSync(instructionsPath)) {
    existing = readFileSync(instructionsPath, "utf-8");
    if (existing.includes("repomemory")) {
      console.log(chalk.yellow("\u26a0  copilot-instructions.md already references repomemory"));
      return;
    }
  }

  writeFileSync(instructionsPath, existing + "\n" + content);

  console.log(chalk.green("\n\u2713 GitHub Copilot configured!\n"));
  console.log(`  ${chalk.green("\u2713")} Updated .github/copilot-instructions.md`);
}

function setupWindsurf(repoRoot: string) {
  const rulesPath = join(repoRoot, ".windsurfrules");

  const content = `# Repository Context — repomemory

This project uses repomemory for persistent AI memory across sessions.

## Before Starting Work
1. Read \`.context/index.md\` for immediate project understanding
2. Search \`.context/facts/\` for architecture documentation relevant to your task
3. Check \`.context/decisions/\` before proposing alternative approaches
4. Review \`.context/regressions/\` before touching code that has broken before

## During Your Session
- Document important discoveries in \`.context/sessions/\`
- Record bug patterns in \`.context/regressions/\`
- Record architectural decisions in \`.context/decisions/\`

## Context Structure
- \`.context/facts/\` — Architecture, patterns, how things work
- \`.context/decisions/\` — Why things are this way (prevents re-debating)
- \`.context/regressions/\` — Known gotchas (prevents re-breaking)
- \`.context/preferences/\` — Coding style, preferred patterns
- \`.context/sessions/\` — What happened in previous AI sessions
- \`.context/changelog/\` — Monthly git history
`;

  if (existsSync(rulesPath)) {
    const existing = readFileSync(rulesPath, "utf-8");
    if (existing.includes("repomemory")) {
      console.log(chalk.yellow("\u26a0  .windsurfrules already references repomemory"));
      return;
    }
    writeFileSync(rulesPath, existing + "\n" + content);
  } else {
    writeFileSync(rulesPath, content);
  }

  console.log(chalk.green("\n\u2713 Windsurf configured!\n"));
  console.log(`  ${chalk.green("\u2713")} Created/updated .windsurfrules`);
}

function setupCline(repoRoot: string) {
  const rulesPath = join(repoRoot, ".clinerules");

  const content = `# Repository Context — repomemory

This project uses repomemory for persistent AI memory across sessions.

## Always Do First
1. Read \`.context/index.md\` for project orientation
2. Search relevant \`.context/facts/\` files for your current task
3. Check \`.context/decisions/\` before suggesting alternatives
4. Review \`.context/regressions/\` before modifying fragile code

## Write Back
- Record session discoveries in \`.context/sessions/\`
- Record new bug patterns in \`.context/regressions/\`
- Record new decisions in \`.context/decisions/\`
- Record coding preferences in \`.context/preferences/\`
`;

  if (existsSync(rulesPath)) {
    const existing = readFileSync(rulesPath, "utf-8");
    if (existing.includes("repomemory")) {
      console.log(chalk.yellow("\u26a0  .clinerules already references repomemory"));
      return;
    }
    writeFileSync(rulesPath, existing + "\n" + content);
  } else {
    writeFileSync(rulesPath, content);
  }

  console.log(chalk.green("\n\u2713 Cline configured!\n"));
  console.log(`  ${chalk.green("\u2713")} Created/updated .clinerules`);
}

function setupAider(repoRoot: string) {
  const conventionsPath = join(repoRoot, ".aider.conf.yml");
  const readPath = join(repoRoot, ".context", "index.md");

  // Aider uses read: to auto-include files in context
  const content = `# repomemory — auto-include context files
read:
  - .context/index.md
`;

  if (existsSync(conventionsPath)) {
    const existing = readFileSync(conventionsPath, "utf-8");
    if (existing.includes("repomemory") || existing.includes(".context/")) {
      console.log(chalk.yellow("\u26a0  .aider.conf.yml already references repomemory"));
      return;
    }
    writeFileSync(conventionsPath, existing + "\n" + content);
  } else {
    writeFileSync(conventionsPath, content);
  }

  console.log(chalk.green("\n\u2713 Aider configured!\n"));
  console.log(`  ${chalk.green("\u2713")} Created/updated .aider.conf.yml`);
  console.log(chalk.dim(`  Aider will auto-include .context/index.md in every session.`));
  if (!existsSync(readPath)) {
    console.log(chalk.yellow(`  \u26a0 Run \`repomemory init && repomemory analyze\` first to generate context files.`));
  }
}

function setupContinue(repoRoot: string) {
  const continueDir = join(repoRoot, ".continue");
  mkdirSync(continueDir, { recursive: true });

  const rulesPath = join(continueDir, "rules", "repomemory.md");
  mkdirSync(join(continueDir, "rules"), { recursive: true });

  const content = `# Repository Context — repomemory

This project uses repomemory for persistent AI memory across sessions.

## Before Starting Work
1. Read \`.context/index.md\` for project orientation
2. Check \`.context/facts/\` for architecture docs
3. Review \`.context/decisions/\` before proposing alternatives
4. Check \`.context/regressions/\` for known issues

## During Your Session
- Record discoveries in \`.context/sessions/\`
- Record bug patterns in \`.context/regressions/\`
- Record decisions in \`.context/decisions/\`
- Record coding preferences in \`.context/preferences/\`
`;

  writeFileSync(rulesPath, content);

  console.log(chalk.green("\n\u2713 Continue configured!\n"));
  console.log(`  ${chalk.green("\u2713")} Created .continue/rules/repomemory.md`);
}
