# repomemory — Instructions for AI Coding Agents

> This file is for Codex, Copilot Workspace, Devin, and any other AI agent working on this codebase.

## Project Overview

**repomemory** is a CLI tool + MCP server that gives AI coding agents persistent memory for repositories. It creates a `.context/` directory with structured knowledge (facts, decisions, regressions, session logs) that agents can search, write to, and delete from.

**Language:** TypeScript (ESM, strict mode)
**Runtime:** Node.js 18+
**Package manager:** npm
**Build:** `npm run build` (runs tsc + shebang injection via `scripts/build.js`)
**Test:** `npm test` (vitest)

## Repository Structure

```
src/index.ts                 → CLI entry point (Commander.js, 9 commands)
src/commands/init.ts         → Scaffolds .context/ directory
src/commands/analyze.ts      → AI-powered repo analysis (core feature)
src/commands/sync.ts         → Git history → changelog sync with deduplication
src/commands/serve.ts        → Starts MCP server
src/commands/setup.ts        → Configures 7 AI tools (Claude/Cursor/Copilot/Windsurf/Cline/Aider/Continue)
src/commands/status.ts       → Coverage bars, freshness indicators, suggestions
src/commands/wizard.ts       → Interactive guided setup (@clack/prompts)
src/commands/dashboard.ts    → Localhost web dashboard (port 3333)
src/mcp/server.ts            → MCP server with 5 tools + graceful shutdown
src/lib/ai-provider.ts       → Multi-provider AI abstraction (Anthropic/OpenAI/Gemini/Grok)
src/lib/config.ts            → Configuration loading with Zod validation
src/lib/context-store.ts     → CRUD + delete for .context/ files
src/lib/search.ts            → sql.js (Wasm) FTS5 full-text search
src/lib/json-repair.ts       → JSON extraction/repair from AI output
src/lib/git.ts               → Git info extraction (execFileSync, no shell injection)
src/lib/repo-scanner.ts      → Repository scanning with .gitignore support
scripts/build.js             → Build script (tsc + shebang injection)
tests/                       → vitest test suite
```

## How to Build and Test

```bash
npm install
npm run build                 # Compiles to dist/ with shebang
npm test                      # Run vitest suite
node dist/index.js --help     # Verify CLI works
```

For development without building:
```bash
npx tsx src/index.ts --help
```

## Key Architecture Decisions

1. **ESM only** — `"type": "module"` in package.json. All internal imports use `.js` extensions.

2. **sql.js (Wasm SQLite)** — Zero native compilation. Replaced better-sqlite3. Install works instantly on all platforms.

3. **Anthropic uses streaming** — `client.messages.stream()`, not `client.messages.create()`. Required for long-running requests.

4. **JSON extraction is multi-strategy** — AI models wrap JSON in code fences, produce truncated output, or insert literal newlines. `json-repair.ts` has 4 parsing strategies.

5. **execFileSync for git** — No shell injection possible. All git commands use argument arrays, not template strings.

6. **Zod for config validation** — `.repomemory.json` is validated on load. Bad fields get warnings, not crashes.

7. **Category validation** — MCP write/delete operations validate against allowed categories to prevent path traversal.

## Adding a New AI Provider

1. Add the provider function in `src/lib/ai-provider.ts`
2. Add the provider name to the `ProviderSchema` enum in `src/lib/config.ts`
3. Add env variable mapping in `resolveApiKeyForProvider()` in `ai-provider.ts`
4. Add pricing data in `estimateCost()` in `ai-provider.ts`
5. Update README.md, CLAUDE.md, and AGENTS.md

## Adding a New MCP Tool

1. Add the tool definition in `ListToolsRequestSchema` handler in `src/mcp/server.ts`
2. Add the tool handler in `CallToolRequestSchema` switch statement
3. Tools receive arguments as `args` object, return `{ content: [{ type: "text", text: "..." }] }`
4. Add input validation (category, filename)

## Adding a New CLI Command

1. Create `src/commands/yourcommand.ts` exporting an async function
2. Import and register in `src/index.ts` with `program.command(...).action(...)`
3. Follow existing pattern: accept `options` object, use `chalk` for output, `ora` for spinners

## Adding a New AI Tool Setup

1. Add the tool name to `SUPPORTED_TOOLS` array in `src/commands/setup.ts`
2. Add a `setup<Tool>()` function following existing patterns
3. Add to the switch statement in `setupCommand()`
4. Add as an option in `src/commands/wizard.ts`

## Important Constraints

- **Fast install required** — This runs via `npx`. No native modules.
- **Node 18+ compatibility** — Don't use Node 22+ features.
- **No breaking changes to .context/ structure** — Users commit this to git.
- **Graceful errors** — Global error handler in `src/index.ts` + `unhandledRejection` handler.
- **AI provider abstraction** — All AI calls go through `ai-provider.ts`.
- **Category validation** — All categories are validated in both CLI and MCP server.
