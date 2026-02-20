# Doctor Command

`repomemory doctor` runs diagnostics and outputs a health report.

## Checks performed
- Config load and JSON validity
- API key presence for configured provider
- Embedding provider key presence
- `.context/` directory existence and structure
- Context subdirectory completeness (facts, decisions, regressions, sessions, changelog, preferences)
- `index.md` presence and content
- Context file stats
- Search index health (rebuild + probe query)
- Global context directory
- Local `.mcp.json` presence
- Claude `~/.claude.json` MCP server entry

## Flags
- `--json` — machine-readable JSON output
- `--output <path>` — write full diagnostics bundle to file
- `--dir <path>` — target repo directory

## Exit code
Non-zero (1) if any check has `fail` status. Warnings don't cause failure.

## File
`src/commands/doctor.ts`
