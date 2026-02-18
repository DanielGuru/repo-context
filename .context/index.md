# repomemory — Agent Quick Reference

## What This Is
A CLI tool + MCP server (`npm package: repomemory`) that gives AI coding agents persistent, structured memory for repositories. Agents search, write, and delete knowledge that persists across sessions.

## Tech Stack
- **Runtime:** Node.js ≥18, TypeScript + ESM (`"type": "module"`)
- **Build:** `scripts/build.js` (custom, adds shebang to `dist/index.js`)
- **CLI:** Commander.js (`src/index.ts`)
- **Search:** sql.js (Wasm SQLite FTS5) + optional vector embeddings (OpenAI/Gemini)
- **MCP:** `@modelcontextprotocol/sdk`
- **Testing:** Vitest
- **Config validation:** Zod

## Key File Locations
- Entry point: `src/index.ts`
- CLI commands: `src/commands/*.ts`
- MCP server: `src/mcp/server.ts`
- Core libs: `src/lib/` (config, search, context-store, embeddings, ai-provider, git, repo-scanner, json-repair)
- Config schema: `src/lib/config.ts` (DEFAULT_CONFIG + Zod validation)
- Build script: `scripts/build.js`
- Tests: `tests/*.test.ts`

## Commands
```bash
npm install          # Install deps
npm run dev -- <cmd> # Run via tsx (dev)
npm run build        # Compile to dist/
npm test             # Run all tests (vitest run)
node dist/index.js --help  # Test built version
```

## Critical Warnings
- **All imports use `.js` extensions** even for `.ts` source files (ESM + `moduleResolution: nodenext`)
- **`scripts/build.js` adds shebang** — if `dist/index.js` lacks shebang, check that script
- **Anthropic MUST use `.stream()`** — `.create()` fails for long operations
- **`json-repair.ts` is fragile** — multi-strategy JSON parser for AI output; be careful changing it
- **sql.js is Wasm** — no native compilation, but requires careful async initialization
- **6 categories only:** `facts`, `decisions`, `regressions`, `sessions`, `changelog`, `preferences`

## Active Development Areas
- v1.1.1 just released (2026-02-18): 25 audit fixes, security hardening
- Hybrid search (FTS5 + vector), auto-session capture, intelligent category routing all added in v1.1.0