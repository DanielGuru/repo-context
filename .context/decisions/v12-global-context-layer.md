# v1.2: Global Context Layer

**Status:** Implemented (2026-02-18)

## Decision
Added a developer-layer global context at `~/.repomemory/global/` that persists across all repos. Preferences follow the developer; architecture/decisions/sessions stay repo-scoped.

## Key Design Choices
- **Category-based routing:** `preferences/` defaults to global scope, everything else defaults to repo scope
- **No content analysis heuristics** — category alone determines default scope
- **Two separate search DBs** merged at result level (not DB level)
- **Optional `scope` parameter** on all MCP tools for explicit override
- **Repo-level preferences shadow global** — same category/filename in `.context/` wins over `~/.repomemory/global/`
- **Backwards compatible** — `enableGlobalContext: false` makes v1.2 behave like v1.1

## Implementation
- `ContextStore.forAbsolutePath(dir)` — static factory for global store
- `resolveGlobalDir(config)` — expands `~` in config path
- `resolveScope(category, explicitScope?)` — routing helper in server.ts
- Dual SearchIndex instances, merged in search handler
- `auto_orient` shows global preferences with [global] tag, repo overrides with [repo override]
- CLI: `repomemory global list/read/write/delete/export/import`
- Bootstrap: `go.ts` auto-creates `~/.repomemory/global/` on first run