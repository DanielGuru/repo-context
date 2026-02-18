# Changelog

## 1.0.0 (2026-02-18)

### New Features
- **Interactive wizard** (`repomemory wizard`) — guided setup with @clack/prompts
- **Web dashboard** (`repomemory dashboard`) — localhost dark-mode UI with markdown rendering, search, category filtering
- **Status command** (`repomemory status`) — coverage bars, freshness indicators, stale warnings
- **Git hooks** (`repomemory hook install`) — auto-sync changelog on commits
- **MCP prompts** — `start-task` and `end-session` conversation starters
- **`context_delete` MCP tool** — agents can prune stale knowledge
- **`--dry-run` mode** — preview analysis with cost estimate, no API call
- **`--merge` mode** — update context without overwriting manual edits
- **Retry with exponential backoff** on AI provider failures
- **API key validation** before expensive analysis calls
- **Cost estimation** before and after analysis
- **Claude Code plugin** with `.mcp.json` and `/repomemory` skill
- **MCP tool annotations** — `readOnlyHint`/`destructiveHint` for directory compliance
- **MCP registry metadata** — `server.json` for registry submission

### Tool Integrations (7 total)
- Claude Code, Cursor, GitHub Copilot, Windsurf, Cline, Aider, Continue

### Infrastructure
- Replaced `better-sqlite3` with `sql.js` (Wasm) — zero native compilation, instant `npx` install
- FTS5 search with automatic fallback to scored LIKE queries
- Zod schema validation for `.repomemory.json`
- `execFileSync` for all git operations (no shell injection)
- `.gitignore` support in repo scanner
- Multi-ecosystem framework detection (JS, Python, Rust, Go, Ruby)
- 106 vitest tests across 4 suites
- GitHub Actions CI (Node 18/20/22 matrix) + release workflow
- Issue templates, PR template, contributing guide

### Bug Fixes
- Fixed duplicate `DEFAULT_CONFIG` between init.ts and config.ts
- Fixed wrong GitHub URL in init template
- Fixed Gemini provider to use `systemInstruction` instead of XML wrapper
- Fixed monorepo workspace detection logic
- Fixed sync deduplication (commit hash tracking)
- Removed dead code (`resolveApiKey`, unused `glob` dep)
- Added `unhandledRejection` handler

## 0.1.0 (2026-02-17)

Initial release.
- CLI with 6 commands (init, analyze, sync, serve, setup, status)
- MCP server with 4 tools (search, write, list, read)
- FTS5 search via better-sqlite3
- Support for Anthropic, OpenAI, Gemini, Grok providers
- Setup for Claude Code, Cursor, GitHub Copilot
