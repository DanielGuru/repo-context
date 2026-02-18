# repomemory — Instructions for AI Coding Agents

> This file is for Codex, Copilot Workspace, Devin, OpenClaw, and any other AI agent working on this codebase.

## Project Overview

**repomemory** is a CLI tool + MCP server that gives AI coding agents persistent memory for repositories. It creates a `.context/` directory with structured knowledge (facts, decisions, regressions, session logs) that agents can search and write to.

**Language:** TypeScript (ESM, strict mode)
**Runtime:** Node.js 18+
**Package manager:** npm
**Build:** `npm run build` (runs tsc + shebang injection via `scripts/build.js`)

## Repository Structure

```
src/index.ts                 → CLI entry point (Commander.js)
src/commands/init.ts         → Scaffolds .context/ directory
src/commands/analyze.ts      → AI-powered repo analysis (core feature)
src/commands/sync.ts         → Git history → changelog sync
src/commands/serve.ts        → Starts MCP server
src/commands/setup.ts        → Configures Claude/Cursor/Copilot integration
src/mcp/server.ts            → MCP server with 4 tools
src/lib/ai-provider.ts       → Multi-provider AI abstraction (Anthropic/OpenAI/Gemini/Grok)
src/lib/config.ts            → Configuration loading (.repomemory.json)
src/lib/context-store.ts     → CRUD for .context/ files
src/lib/search.ts            → SQLite FTS5 full-text search
src/lib/git.ts               → Git log/diff parsing
src/lib/repo-scanner.ts      → Repository file tree scanning
scripts/build.js             → Build script (tsc + shebang injection)
```

## How to Build and Test

```bash
npm install
npm run build                 # Compiles to dist/ with shebang
node dist/index.js --help     # Verify CLI works
node dist/index.js init       # Test init command
```

For development without building:
```bash
npx tsx src/index.ts --help
```

## Key Architecture Decisions

1. **ESM only** — `"type": "module"` in package.json. All internal imports use `.js` extensions even for `.ts` source files. This is required for Node.js ESM resolution.

2. **Anthropic uses streaming** — The Anthropic SDK throws if a non-streaming request would take >10 minutes. The provider in `ai-provider.ts` uses `client.messages.stream()`, not `client.messages.create()`.

3. **JSON extraction is multi-strategy** — AI models wrap JSON in code fences, produce truncated output, or insert literal newlines in strings. `analyze.ts` has 4 parsing strategies that run in sequence: direct parse → fix newlines → repair truncation → fix newlines + repair truncation.

4. **FTS5 for search, no embeddings** — `better-sqlite3` with SQLite FTS5 virtual tables. Porter stemming tokenizer. Sufficient for <100 knowledge files. The `.search.db` file is stored in `.context/` and gitignored.

5. **Build needs shebang injection** — TypeScript compiler strips `#!/usr/bin/env node`. The `scripts/build.js` post-build script adds it back and sets executable permissions.

## Adding a New AI Provider

1. Add the provider function in `src/lib/ai-provider.ts` (follow the pattern of existing providers)
2. Add the provider name to the union type in `src/lib/config.ts`
3. Add env variable mapping in `resolveApiKeyForProvider()` in `ai-provider.ts`
4. Update README.md and this file

## Adding a New MCP Tool

1. Add the tool definition in `ListToolsRequestSchema` handler in `src/mcp/server.ts`
2. Add the tool handler in `CallToolRequestSchema` switch statement
3. Tools receive arguments as `args` object, return `{ content: [{ type: "text", text: "..." }] }`

## Adding a New CLI Command

1. Create `src/commands/yourcommand.ts` exporting an async function
2. Register in `src/index.ts` with `program.command(...).action(yourCommand)`
3. Follow existing pattern: accept `options` object, use `chalk` for output

## Important Constraints

- **Fast install required** — This runs via `npx`, so dependencies must be minimal. Don't add heavy packages.
- **Node 18+ compatibility** — Don't use Node 22+ features.
- **No breaking changes to .context/ structure** — Users commit this to git. Changes to directory structure or file formats need migration logic.
- **Graceful errors** — The global error handler in `src/index.ts` catches uncaught exceptions and shows friendly messages. Never let raw stack traces reach users.
- **AI provider abstraction** — All AI calls go through `ai-provider.ts`. Never import `@anthropic-ai/sdk` or `openai` directly in command files.

## Testing the MCP Server

The MCP server communicates over stdio (JSON-RPC). To test manually:

```bash
# Start server
node dist/index.js serve --dir /path/to/repo

# In another terminal, send JSON-RPC:
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node dist/index.js serve --dir /path/to/repo
```

For proper testing, use a spawned process that keeps stdin open (see Claude Code or any MCP client).

## What the Output Looks Like

When a user runs `repomemory analyze` on their project, it generates:

```
.context/
├── index.md                    # 30-60 line quick orientation
├── facts/
│   ├── architecture.md         # Services, connections, deployment
│   ├── database.md             # Schema, tables, relationships
│   └── deployment.md           # How to deploy, env vars
├── decisions/
│   └── why-we-chose-x.md       # Rationale with alternatives considered
├── regressions/
│   └── known-bug-pattern.md    # What broke, root cause, prevention
├── sessions/                   # Written by agents during sessions
└── changelog/
    └── 2026-02.md              # Git history sync
```
