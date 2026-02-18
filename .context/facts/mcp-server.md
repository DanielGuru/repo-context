# MCP Server Details

## File: `src/mcp/server.ts`

## Session Tracking
- Tracks all tool calls during a session
- Auto-writes session summary to `sessions/` on graceful shutdown (SIGTERM/SIGINT)
- Works with ALL MCP clients — no hooks required

## Auto-Purge Detection
- `context_write` checks for overlapping entries on same topic
- Warns about potential supersedes
- Optional `supersedes` parameter for auto-delete of old entry

## Tool Annotations
All tools have MCP annotations (added in v0.2.1) for better client display.

## Prompts
2 MCP prompts registered (in addition to 6 tools).

## Resources
MCP resources registered for direct file access.

## Starting the Server
```bash
# Via CLI
npx repomemory serve

# Via npm dev
npm run dev -- serve --dir /path/to/repo
```

## Claude Code Integration
`repomemory setup claude` writes to `~/.claude.json` (the actual MCP config file).
The MCP server auto-starts with Claude Code after setup.

## Skills
- `skills/repomemory/SKILL.md` — main skill
- `skills/session-start/SKILL.md` — session start behavior
- `skills/session-end/SKILL.md` — session end behavior (auto-capture)

## Server Config
`server.json` — MCP registry metadata