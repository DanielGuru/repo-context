# Claude Code Post-Commit Hook

## What It Does
After `repomemory setup claude`, a `PostToolUse` hook is installed at `.claude/settings.json` that fires after Bash commands containing `git commit`. It outputs a reminder to the agent to record context using `context_write`.

## Files
- `.claude/settings.json` — Hook config (project-level, shareable via git)
- `.claude/hooks/post-commit-context.sh` — Script that checks stdin for git commit and outputs reminder

## How It Works
1. Claude Code fires `PostToolUse` after every Bash call
2. The `matcher: "Bash"` ensures it only runs for shell commands
3. The script reads JSON stdin, extracts the command via `jq`
4. If the command contains "git commit", it outputs a context-write reminder
5. Claude sees the reminder as additional context and is prompted to act

## Installation
Installed by `setup claude` in `src/commands/setup.ts`. The MCP server goes to `~/.claude.json` (global), the hook goes to `.claude/settings.json` (project-level).