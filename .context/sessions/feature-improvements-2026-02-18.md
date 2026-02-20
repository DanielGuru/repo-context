# Feature Improvements Session — 2026-02-18

## What We Did

Evaluated 11 feature suggestions from agent feedback and an external gist. Rejected 8, implemented 5.

### Implemented
1. **Fixed session capture threshold** — Changed from `toolCalls > 2 && duration > 60` to `writeCallMade || toolCalls.length > 2`. Duration was a bad signal; short productive sessions were being lost.
2. **Fixed context_write O(n) listEntries() call** — Was reading every file in the category to find the one just written. Now constructs the ContextEntry directly from the write result.
3. **Added CLI search command** — `repomemory search <query>` with --category, --limit, --detail flags. Searches both repo and global context. Primary debugging tool for "why doesn't the agent know X?"
4. **Added global search index lazy-init** — If global index fails at startup, it now gets lazy-initialized on first search (matching the existing repo index behavior).
5. **Added staleness section to context_auto_orient** — Shows entries untouched for 30+ days with a caveat that they may still be accurate.

### Rejected (with reasoning)
- **context_reflect** — Would require LLM in MCP server; the problem is prompt engineering, not tool engineering
- **content_sanitize** — Security theater; threat model doesn't hold up for local-first tool
- **LRU embedding cache** — Document embeddings already cached in SQLite BLOBs; query cache is minor optimization
- **LLM reranker** — Over-engineered for typical 20-100 entry knowledge bases
- **context_health MCP tool** — CLI `status` already covers this for humans; agents don't need health reports
- **Unified audit log** — Sessions + git log already cover the debugging use case
- **Session idempotency** — Non-issue; appendEntry already handles same-day sessions correctly
- **append mode on context_write** — Already exists (append parameter)

## Files Changed
- `src/mcp/server.ts` — Session threshold, context_write fix, global lazy-init, staleness section
- `src/commands/search.ts` — New file: CLI search command
- `src/index.ts` — Registered search command
- `CLAUDE.md` — Updated docs with search command