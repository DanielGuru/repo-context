import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from "fs";
import { join } from "path";
import chalk from "chalk";

const SUPPORTED_TOOLS = ["claude", "cursor", "copilot", "windsurf", "cline", "aider", "continue"];

function printCursorCommands() {
  console.log();
  console.log(chalk.bold("Cursor commands available (type / in chat):"));
  console.log(chalk.cyan("  /repomemory-analyze") + chalk.dim("  — Full repo analysis, populate context"));
  console.log(chalk.cyan("  /repomemory-orient") + chalk.dim("   — Quick project orientation"));
  console.log(chalk.cyan("  /repomemory-search") + chalk.dim("   — Search knowledge base"));
  console.log(chalk.cyan("  /repomemory-record") + chalk.dim("   — Record a fact, decision, or regression"));
  console.log(chalk.cyan("  /repomemory-session") + chalk.dim("  — Save session summary"));
  console.log(chalk.cyan("  /repomemory-status") + chalk.dim("   — Show context coverage"));
}

export async function setupCommand(tool: string, options: { dir?: string }) {
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
      throw new Error("Could not parse ~/.claude.json. Is Claude Code installed?");
    }
  } else {
    throw new Error("~/.claude.json not found. Install Claude Code first.");
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

  // Always write/update the hook script (fixes upgrades from broken versions)
  mkdirSync(claudeDir, { recursive: true });
  const hooksDir = join(claudeDir, "hooks");
  mkdirSync(hooksDir, { recursive: true });
  const hookScriptPath = join(hooksDir, "post-commit-context.sh");

  const hookScript = `#!/bin/bash
# repomemory: remind agent to record context after git commits
# Installed by: repomemory setup claude

# Read stdin, check for git commit without jq dependency
INPUT=$(cat 2>/dev/null || true)

if echo "$INPUT" | grep -q '"git commit' 2>/dev/null; then
  echo "You just committed code. Before continuing, record what you learned using repomemory:"
  echo "- Decisions made -> context_write(category=\\"decisions\\", ...)"
  echo "- Bugs found or fixed -> context_write(category=\\"regressions\\", ...)"
  echo "- Architecture learned -> context_write(category=\\"facts\\", ...)"
fi

exit 0
`;
  writeFileSync(hookScriptPath, hookScript);
  chmodSync(hookScriptPath, "755");

  // Add hook to .claude/settings.json if not already present
  const existingHooks = projectSettings.hooks as Record<string, unknown[]> | undefined;
  if (existingHooks?.PostToolUse) {
    const serialized = JSON.stringify(existingHooks.PostToolUse);
    if (serialized.includes("post-commit-context")) {
      hookAlreadyConfigured = true;
    }
  }

  if (!hookAlreadyConfigured) {
    const postToolUseHook = {
      matcher: "Bash",
      hooks: [
        {
          type: "command",
          command: `${repoRoot}/.claude/hooks/post-commit-context.sh`,
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
    console.log(chalk.dim(JSON.stringify({ repomemory: mcpServers["repomemory"] }, null, 2)));
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
  console.log(
    chalk.dim("Tools: context_search, context_write, context_read, context_list, context_delete, context_auto_orient")
  );
}

function setupCursor(repoRoot: string) {
  // --- Part 1: Global MCP server in ~/.cursor/mcp.json ---
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const cursorConfigDir = join(homeDir, ".cursor");
  const mcpConfigPath = join(cursorConfigDir, "mcp.json");

  let mcpAlreadyConfigured = false;

  if (homeDir) {
    // Create ~/.cursor/ if it doesn't exist (Cursor will use it on next launch)
    mkdirSync(cursorConfigDir, { recursive: true });

    let mcpConfig: Record<string, unknown> = {};

    if (existsSync(mcpConfigPath)) {
      try {
        mcpConfig = JSON.parse(readFileSync(mcpConfigPath, "utf-8"));
      } catch {
        mcpConfig = {};
      }
    }

    const mcpServers = (mcpConfig.mcpServers || {}) as Record<string, unknown>;

    if (mcpServers["repomemory"]) {
      mcpAlreadyConfigured = true;
    } else {
      mcpServers["repomemory"] = {
        command: "npx",
        args: ["-y", "repomemory", "serve"],
      };
      mcpConfig.mcpServers = mcpServers;
      writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
    }
  }

  // --- Part 2: Project-level .cursor/rules/repomemory.mdc ---
  const cursorRulesDir = join(repoRoot, ".cursor", "rules");
  mkdirSync(cursorRulesDir, { recursive: true });

  const ruleContent = `---
description: Repository context and memory system
globs: **/*
---

# Repository Memory (repomemory)

This project uses repomemory for persistent AI memory via MCP tools.
You have access to both Cursor's native codebase understanding AND repomemory's knowledge base.
**Use both together** — Cursor sees the code, repomemory remembers the context across sessions.

## Before ANY Task (Required)

1. Call \`context_search\` with keywords related to your task — this checks past decisions, known regressions, and architecture docs that will save you from mistakes
2. If this is a new session or you feel disoriented, call \`context_auto_orient\` for a full project overview
3. Use Cursor's native codebase search to find relevant files, then cross-reference with repomemory's stored knowledge
4. NEVER propose changes without checking \`context_search\` for past decisions on that component

## During Your Session

- When you discover something about the codebase (via reading files, debugging, etc.), **record it** with \`context_write\` — future sessions will thank you
- Use \`context_delete\` to remove stale or incorrect knowledge you find
- Record coding preferences in \`context_write(category="preferences", ...)\` — these persist globally across all projects

## Combining Cursor + repomemory

- **Cursor's strength:** Real-time code understanding, symbol search, file navigation, inline completions
- **repomemory's strength:** Cross-session memory, architectural decisions, regression history, team knowledge
- When searching: use \`context_search\` for high-level knowledge (decisions, patterns, regressions), use Cursor's native search for specific code
- When analyzing: use Cursor to read and understand code, then use \`context_write\` to persist what you learned

## MCP Tools Available

| Tool | Description |
|------|-------------|
| \`context_search\` | Search knowledge base (hybrid keyword + semantic) |
| \`context_write\` | Write/append knowledge entries |
| \`context_read\` | Read full content of an entry |
| \`context_list\` | List all entries by category |
| \`context_delete\` | Remove stale entries |
| \`context_auto_orient\` | Full project orientation in one call |

## Context Structure
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

  writeFileSync(join(cursorRulesDir, "repomemory.mdc"), ruleContent);

  // --- Part 3: Create .cursor/commands/ for Cursor-driven workflows ---
  const cursorCommandsDir = join(repoRoot, ".cursor", "commands");
  mkdirSync(cursorCommandsDir, { recursive: true });

  // Command: Full repo analysis
  writeFileSync(join(cursorCommandsDir, "repomemory-analyze.md"), `---
description: Analyze this repo and populate repomemory context
---
Use your full codebase understanding to analyze this repository and populate the repomemory knowledge base. You have access to both Cursor's native code indexing and the repomemory MCP tools — use both.

## Step 1: Discover (use Cursor's native capabilities)

Browse the project structure, read key files (package.json, config files, entry points, schema files, README, etc.), understand the architecture, tech stack, patterns, and important decisions. Use Cursor's codebase search and symbol navigation to explore thoroughly.

## Step 2: Record (use repomemory MCP tools)

Write what you discovered to the knowledge base:

1. Call \`context_write(category="facts", filename="architecture")\` — Tech stack, directory structure, frameworks, languages, service boundaries. Reference actual file paths.

2. Call \`context_write(category="facts", filename="database")\` — Data layer: ORM, database type, schema patterns, migrations. Skip if no database.

3. Call \`context_write(category="facts", filename="deployment")\` — How the app deploys: hosting, CI/CD, env config, infrastructure. Skip if not apparent.

4. Call \`context_write(category="facts", filename="patterns")\` — Key code patterns: error handling, auth, API design, state management, testing approach.

5. Call \`context_write(category="facts", filename="api")\` — API routes/endpoints, request/response patterns, middleware. Skip if not an API.

6. Call \`context_write(category="decisions")\` for any clear architectural decisions visible in the code (e.g., framework choices, library selections, patterns that suggest deliberate choices).

7. Update the project index: Call \`context_write(category="index")\` with a concise project summary — what this project is, the main entry points, and how to get oriented quickly.

## Quality Standards

- **Reference actual file paths** — don't be vague, point to real files
- **Be specific about versions** — note framework/library versions from package.json or lock files
- **Include code patterns** — show actual function signatures or patterns used, not just descriptions
- **Note what's missing** — if there are no tests, no CI, no types, say so — that's valuable context too

This context will be used by AI agents in every future session, so accuracy matters more than brevity.
`);

  // Command: Quick orientation
  writeFileSync(join(cursorCommandsDir, "repomemory-orient.md"), `---
description: Orient yourself in this project using repomemory context
---
Get oriented in this project by combining repomemory's stored knowledge with Cursor's live codebase understanding.

1. Call \`context_auto_orient()\` to load stored context — project index, coding preferences, recent sessions, and recent changes.
2. Cross-reference with the actual codebase — verify the stored context is still accurate by checking key files Cursor can see.
3. If context seems sparse or empty, suggest running \`/repomemory-analyze\` first.

Summarize what you know about this project, noting any discrepancies between stored context and current code state.
`);

  // Command: Search context
  writeFileSync(join(cursorCommandsDir, "repomemory-search.md"), `---
description: Search repomemory context for relevant knowledge
---
Search for knowledge using both repomemory's stored context and Cursor's live codebase understanding.

1. Call \`context_search(query="<search terms>")\` with relevant keywords to find stored knowledge (past decisions, known regressions, architecture docs, preferences).
2. Use Cursor's native codebase search to find relevant code, files, and symbols that relate to the query.
3. Combine both results — stored knowledge gives you the "why" and history, Cursor's code search gives you the current "what".

Present results clearly:
- **From repomemory:** Category, key findings, relevance to the query
- **From codebase:** Relevant files, functions, patterns found
- **Gaps:** Note if something exists in code but isn't documented in repomemory (offer to record it)
`);

  // Command: Record knowledge
  writeFileSync(join(cursorCommandsDir, "repomemory-record.md"), `---
description: Record a fact, decision, or regression to repomemory
---
Ask the user what they want to record, or infer from the current conversation. Determine the right category:

- **facts/** — How things work (architecture, APIs, patterns, integrations)
- **decisions/** — Why something was chosen ("We use X instead of Y because...")
- **regressions/** — Bugs, gotchas, things that broke ("Never do X because Y happens")
- **preferences/** — Coding style, conventions ("Always use early returns", "Prefer X over Y")

Call \`context_write(category="<category>", filename="<descriptive-name>", content="<content>")\` with well-structured markdown content.

Confirm what was recorded and where.
`);

  // Command: Session summary
  writeFileSync(join(cursorCommandsDir, "repomemory-session.md"), `---
description: Save a summary of this session to repomemory
---
Review the current conversation and summarize what was accomplished, what was learned, and any important decisions or discoveries.

Call \`context_write(category="sessions", filename="<date-slug>", content="<summary>")\` with a structured summary including:

- **What was done** — Tasks completed, files changed
- **Decisions made** — Any choices about architecture, approach, tools
- **Issues found** — Bugs, gotchas, unexpected behavior
- **Next steps** — What should happen next

This helps future AI sessions pick up where you left off.
`);

  // Command: Show status
  writeFileSync(join(cursorCommandsDir, "repomemory-status.md"), `---
description: Show repomemory context coverage and freshness
---
Call \`context_list()\` to see all entries in the knowledge base.

Present the results as a status report:
- How many entries per category (facts, decisions, regressions, preferences, sessions)
- Which categories are empty or sparse
- When entries were last updated (if dates are visible in content)

Suggest what's missing — e.g., "No regressions recorded yet" or "Architecture facts could use more detail."
`);

  // --- Output ---
  if (mcpAlreadyConfigured) {
    console.log(chalk.green("\n\u2713 Cursor configured!\n"));
    console.log(`  ${chalk.green("\u2713")} MCP server already in ${mcpConfigPath}`);
    console.log(`  ${chalk.green("\u2713")} Updated .cursor/rules/repomemory.mdc`);
    console.log(`  ${chalk.green("\u2713")} Updated .cursor/commands/ (6 commands)`);
    console.log();
    console.log(chalk.dim("Restart Cursor to pick up any changes."));
    printCursorCommands();
    return;
  }

  console.log(chalk.green("\n\u2713 Cursor configured!\n"));

  if (homeDir) {
    console.log(chalk.bold(`MCP server added to ${mcpConfigPath}:`));
    console.log(
      chalk.dim(JSON.stringify({ repomemory: { command: "npx", args: ["-y", "repomemory", "serve"] } }, null, 2))
    );
    console.log();
  }

  console.log(`  ${chalk.green("\u2713")} Created .cursor/rules/repomemory.mdc`);
  console.log(`  ${chalk.green("\u2713")} Created .cursor/commands/ (6 commands)`);
  console.log();
  console.log(chalk.dim("Restart Cursor to activate. The MCP server will auto-start in every project."));
  printCursorCommands();
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
    console.log(
      chalk.yellow(`  \u26a0 Run \`repomemory init && repomemory analyze\` first to generate context files.`)
    );
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
