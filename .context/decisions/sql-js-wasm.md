# Decision: sql.js (Wasm SQLite) for Search

## What Was Decided
Use `sql.js` (WebAssembly SQLite) instead of native SQLite bindings (`better-sqlite3`, `node-sqlite3`).

## Why
- **Zero native compilation** — `npm install` works everywhere instantly
- No node-gyp, no platform-specific binaries, no postinstall failures
- FTS5 extension available for full-text search
- Critical for an `npx`-first tool where install friction must be zero

## Alternatives Considered
- `better-sqlite3`: native, fast, but requires compilation — rejected
- `node-sqlite3`: same issue — rejected
- Pure JS search (lunr.js, etc.): no FTS5, weaker — rejected

## Trade-offs
- Slightly slower than native SQLite
- Larger package size (Wasm binary)
- Custom type definitions needed (`src/types/sql.js.d.ts`)
- FTS5 fallback handling required in `search.ts`