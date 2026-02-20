# repomemory — Instructions for AI Coding Agents

> This file is for Codex, Copilot Workspace, Devin, and any other AI agent working on this codebase.

## Project Overview

**repomemory** is a CLI tool + MCP server that gives AI coding agents persistent memory for repositories. It creates a `.context/` directory with structured knowledge (facts, decisions, regressions, preferences, session logs) that agents can search, write to, and delete from. Features hybrid keyword + semantic search, auto-session capture, intelligent category routing, auto-purge detection, and global developer context (`~/.repomemory/global/`) that follows you across all repos.

**Language:** TypeScript (ESM, strict mode)
**Runtime:** Node.js 20+
**Package manager:** npm
**Build:** `npm run build` (runs tsc + shebang injection via `scripts/build.js`)
**Test:** `npm test` (vitest, 163 tests)

## Repository Structure

```
src/index.ts                 -> CLI entry point (Commander.js, 11 commands)
src/commands/init.ts         -> Scaffolds .context/ directory, exports CLAUDE_MD_BLOCK
src/commands/analyze.ts      -> AI-powered repo analysis (core feature)
src/commands/sync.ts         -> Git history -> changelog sync with deduplication
src/commands/serve.ts        -> Starts MCP server
src/commands/setup.ts        -> Configures 7 AI tools (Claude/Cursor/Copilot/Windsurf/Cline/Aider/Continue)
src/commands/status.ts       -> Coverage bars, freshness indicators, suggestions
src/commands/wizard.ts       -> Interactive guided setup (@clack/prompts)
src/commands/dashboard.ts    -> Localhost web dashboard (port 3333) with edit, search, export
src/commands/hook.ts         -> Git post-commit hook install/uninstall
src/commands/go.ts           -> One-command setup: global profile + init + analyze + setup claude
src/commands/global.ts       -> Manage global developer context (list/read/write/delete/export/import)
src/mcp/server.ts            -> MCP server with 6 tools + 2 prompts + dual store (repo + global) + session tracking
src/lib/ai-provider.ts       -> Multi-provider AI abstraction (Anthropic/OpenAI/Gemini/Grok)
src/lib/embeddings.ts        -> Embedding provider abstraction (OpenAI/Gemini) + cosine similarity
src/lib/config.ts            -> Configuration loading with Zod validation, global context config, resolveGlobalDir()
src/lib/context-store.ts     -> CRUD + delete for .context/ files (6 categories), forAbsolutePath() for global store
src/lib/search.ts            -> sql.js (Wasm) FTS5 + optional vector search, hybrid scoring, DB persistence
src/lib/json-repair.ts       -> JSON extraction/repair from AI output
src/lib/git.ts               -> Git info extraction (execFileSync, no shell injection)
src/lib/repo-scanner.ts      -> Repository scanning with .gitignore support
scripts/build.js             -> Build script (tsc + shebang injection)
tests/                       -> vitest test suite (163 tests)
```

## How to Build and Test

```bash
npm install
npm run build                 # Compiles to dist/ with shebang
npm test                      # Run vitest suite (163 tests)
node dist/index.js --help     # Verify CLI works
```

For development without building:
```bash
npx tsx src/index.ts --help
npm run dev -- go --dir /path/to/repo
npm run dev -- serve --dir /path/to/repo
npm run dev -- dashboard
```

## Key Architecture Decisions

1. **ESM only** — `"type": "module"` in package.json. All internal imports use `.js` extensions.

2. **sql.js (Wasm SQLite)** — Zero native compilation. Install works instantly on all platforms.

3. **Hybrid search** — FTS5 keyword search + optional vector search via API-based embeddings (OpenAI/Gemini). Falls back to keyword-only when no embedding API key is available. DB loaded from disk on restart.

4. **Anthropic uses streaming** — `client.messages.stream()`, not `client.messages.create()`. Required for long-running requests.

5. **JSON extraction is multi-strategy** — AI models wrap JSON in code fences, produce truncated output, or insert literal newlines. `json-repair.ts` has 4 parsing strategies.

6. **execFileSync for git** — No shell injection possible. All git commands use argument arrays, not template strings.

7. **Zod for config validation** — `.repomemory.json` is validated on load. Bad fields get warnings, not crashes.

8. **Category validation** — 6 categories: facts, decisions, regressions, sessions, changelog, preferences. Validated in both `context-store.ts` and `server.ts`.

9. **Progressive disclosure** — `context_search` returns compact one-line results by default. Use `detail="full"` for longer snippets.

10. **Auto-session capture** — MCP server tracks tool calls and auto-writes session summary on shutdown (SIGTERM/SIGINT). Works with ALL MCP clients.

11. **Intelligent category routing** — `detectQueryCategory()` heuristically routes queries to the right category (e.g., "why X" -> decisions, "bug in X" -> regressions).

12. **Auto-purge detection** — `context_write` checks for overlapping entries and warns. Optional `supersedes` parameter for auto-delete.

13. **Global context layer (v1.2)** — Developer preferences at `~/.repomemory/global/`. `preferences/` category defaults to global scope, everything else to repo. Two separate search DBs merged at result level.

14. **Scope routing** — `resolveScope()` in server.ts determines target store. preferences→global, everything else→repo. Optional explicit `scope` parameter on all tools.

15. **NFKD unicode normalization** — Accented characters in filenames are transliterated (café→cafe) before ASCII stripping.

## Adding a New AI Provider

1. Add the provider function in `src/lib/ai-provider.ts`
2. Add the provider name to the `ProviderSchema` enum in `src/lib/config.ts`
3. Add env variable mapping in `resolveApiKeyForProvider()` in `ai-provider.ts`
4. Add pricing data in `estimateCost()` in `ai-provider.ts`
5. Update README.md, CLAUDE.md, and AGENTS.md

## Adding a New Embedding Provider

1. Add the embedding function in `src/lib/embeddings.ts`
2. Add the provider name to the `EmbeddingProviderSchema` in `src/lib/config.ts`
3. Update the auto-detection logic in `createEmbeddingProvider()`
4. Test with `tests/embeddings.test.ts`

## Adding a New MCP Tool

1. Add the tool definition in `ListToolsRequestSchema` handler in `src/mcp/server.ts`
2. Add the tool handler in `CallToolRequestSchema` switch statement
3. Tools receive arguments as `args` object, return `{ content: [{ type: "text", text: "..." }] }`
4. Add input validation (category, filename)
5. Add session tracking instrumentation (record in `session.toolCalls`)
6. Update `server.json` with the new tool

## Adding a New CLI Command

1. Create `src/commands/yourcommand.ts` exporting an async function
2. Import and register in `src/index.ts` with `program.command(...).action(...)`
3. Follow existing pattern: accept `options` object, use `chalk` for output, `ora` for spinners

## Adding a New AI Tool Setup

1. Add the tool name to `SUPPORTED_TOOLS` array in `src/commands/setup.ts`
2. Add a `setup<Tool>()` function following existing patterns
3. Add to the switch statement in `setupCommand()`
4. Add as an option in `src/commands/wizard.ts`

## Adding a New Category

1. Add to `VALID_CATEGORIES` array in `src/mcp/server.ts`
2. Add to `validateCategory()` allowed list in `src/lib/context-store.ts`
3. Add to `scaffold()` dirs array in `src/lib/context-store.ts`
4. Add to `DEFAULT_CONFIG.categories` in `src/lib/config.ts`
5. Update `context_write` tool description enum in `server.ts`
6. Update init.ts index.md content
7. Update tests in `tests/config.test.ts`

## Important Constraints

- **Fast install required** — This runs via `npx`. No native modules.
- **Node 18+ compatibility** — Don't use Node 22+ features.
- **No breaking changes to .context/ structure** — Users commit this to git.
- **Graceful errors** — Global error handler in `src/index.ts` + `unhandledRejection` handler.
- **AI provider abstraction** — All AI calls go through `ai-provider.ts`.
- **Embedding provider abstraction** — All embedding calls go through `embeddings.ts`.
- **Category validation** — All categories are validated in both CLI and MCP server.
- **Hook independence** — MCP server must work standalone without Claude Code hooks. Hooks are optional bonus.
- **Repo isolation** — Each repo has its own `.context/`. Global context at `~/.repomemory/global/` is personal preferences only — no repo-specific data.
- **Backwards compatibility** — `enableGlobalContext: false` must make v1.2 behave exactly like v1.1.
- **Scope routing defaults** — Don't change without updating both `resolveScope()` in server.ts and CLAUDE.md.
