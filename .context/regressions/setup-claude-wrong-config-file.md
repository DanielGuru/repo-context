# Regression: setup claude Wrote to Wrong Config File

## What Happened
Multiple versions had `repomemory setup claude` writing to the wrong file:
- v1.0.0: wrote to `~/.claude/settings.json` (wrong)
- v1.0.1: fixed to `~/.claude/settings.json` (global)
- v1.0.2: fixed again to `~/.claude.json` (the actual MCP config file)

## Root Cause
Claude Code's MCP configuration file is `~/.claude.json`, not `~/.claude/settings.json`.

## Fix
`src/commands/setup.ts` now writes to `~/.claude.json`.

## How to Prevent
If Claude Code changes its config file location, update `src/commands/setup.ts`. The correct file is `~/.claude.json`.