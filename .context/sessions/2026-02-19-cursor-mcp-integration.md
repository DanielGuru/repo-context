# Session: Cursor MCP Integration

## What Was Done
Made repomemory Cursor-ready by adding full MCP server configuration, mirroring what `setup claude` already does.

## Changes
1. **`src/commands/setup.ts`** — `setupCursor()` now configures MCP server in `~/.cursor/mcp.json` (global) AND creates an updated `.cursor/rules/repomemory.mdc` with MCP tool instructions. Previously it only created a static `.mdc` rule file.
2. **`src/commands/go.ts`** — The `go` command now auto-detects Cursor installation (`~/.cursor/` exists) and configures it alongside Claude Code. Non-blocking if it fails.
3. **`README.md`** — Updated comparison table: Cursor now shows "MCP server + .cursor/rules/" instead of just ".cursor/rules/".

## Key Findings
- Cursor has supported MCP servers since 2025 via `~/.cursor/mcp.json`
- Format is identical to Claude Code: `{ "mcpServers": { "name": { "command": "npx", "args": [...] } } }`
- The setup correctly merges into existing Cursor MCP config (preserves other servers)
- Idempotency works: re-running detects existing config