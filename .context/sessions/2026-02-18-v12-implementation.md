# v1.2 Implementation Session — 2026-02-18

## What We Did
1. **Dogfooded repomemory** in its own repo — set up `.context/`, ran `analyze`, stress-tested all 6 MCP tools
2. **Found and fixed 5 bugs** (Phase A):
   - Empty query returning results (server.ts)
   - Category name search returning 0 results (server.ts + search.ts)
   - Auto-purge detection false positives (server.ts)
   - Unicode filename mangling too aggressive (context-store.ts — added NFKD normalization)
   - Hybrid search score normalization compressing range (search.ts — removed artificial 0 bounds)
3. **Built v1.2 Global Context Layer** (Phase B):
   - Config: `enableGlobalContext`, `globalContextDir`, `resolveGlobalDir()` helper
   - ContextStore: `forAbsolutePath()` static factory for `~/.repomemory/global/`
   - MCP server: dual store init, scope routing, all 6 tools updated with `scope` parameter
   - CLI: `repomemory global list/read/write/delete/export/import`
   - Bootstrap: `go.ts` auto-creates global profile on first run
   - Tests: 163 total (12 new for global context)
4. **Updated docs**: CLAUDE.md with v1.2 architecture, forceful agent instructions, version bump to 1.2.0

## Files Changed
- `src/mcp/server.ts` — largest change (dual store, scope routing, all tool handlers)
- `src/lib/config.ts` — global config fields
- `src/lib/context-store.ts` — NFKD normalization + forAbsolutePath factory
- `src/lib/search.ts` — category column scoring + score normalization fix
- `src/commands/global.ts` — NEW (CLI global subcommand)
- `src/commands/go.ts` — bootstrap with global profile step
- `src/index.ts` — register global command
- `tests/global-context.test.ts` — NEW (12 tests)
- `CLAUDE.md` — v1.2 updates + dogfooding instructions
- `package.json` — version 1.2.0