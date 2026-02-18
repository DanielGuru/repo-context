# repo-context — Agent Instructions

## What This Is

A CLI tool + MCP server that gives AI coding agents persistent, structured memory for repositories. Agents can search and write knowledge that persists across sessions.

**npm package:** `repo-context`
**Repo:** https://github.com/DanielGuru/repo-context

## Architecture

```
src/
├── index.ts                  # CLI entry point (Commander.js). Global error handler at bottom.
├── commands/
│   ├── init.ts               # Scaffolds .context/ directory + .repo-context.json config
│   ├── analyze.ts            # AI-powered repo analysis. THE key file — has the system prompt,
│   │                           JSON extraction/repair logic, and orchestration.
│   ├── sync.ts               # Reads git log → writes to .context/changelog/YYYY-MM.md
│   ├── serve.ts              # Thin wrapper that calls startMcpServer()
│   └── setup.ts              # Configures Claude Code / Cursor / Copilot integration
├── mcp/
│   └── server.ts             # MCP server. 4 tools: context_search, context_write,
│                               context_list, context_read. Also exposes resources.
└── lib/
    ├── ai-provider.ts        # Multi-provider abstraction (Anthropic, OpenAI, Gemini, Grok).
    │                           Anthropic uses streaming. Grok uses OpenAI-compatible API.
    ├── config.ts              # Loads .repo-context.json, merges with defaults. Provider type here.
    ├── context-store.ts       # CRUD for .context/ files. Read/write/append/list entries.
    ├── search.ts              # SQLite FTS5 full-text search index over .context/ files.
    ├── git.ts                 # Git log parsing, diff summaries, contributor info.
    └── repo-scanner.ts        # Walks repo tree, detects languages/frameworks, reads key files.
```

## Key Technical Decisions

- **TypeScript + ESM** — `"type": "module"` in package.json. All imports use `.js` extensions.
- **Streaming for Anthropic** — SDK requires streaming for responses >10 minutes. The `stream()` API is used, not `create()`.
- **JSON extraction from AI** — Models often wrap output in code fences or produce truncated JSON. `analyze.ts` has a multi-strategy parser: strip fences → find braces → fix unescaped newlines → repair truncation. This is fragile — be careful changing it.
- **FTS5 for search** — `better-sqlite3` with FTS5 virtual tables. Porter stemming + unicode61 tokenizer. Index stored at `.context/.search.db` (gitignored).
- **No embeddings in v0.1** — FTS5 keyword search is good enough for <100 knowledge files. Vector search is a future addition.
- **Build script** — `scripts/build.js` runs `tsc` then injects `#!/usr/bin/env node` shebang into `dist/index.js`. Plain `tsc` strips shebangs.

## How to Work on This

```bash
# Install
npm install

# Dev (runs TypeScript directly)
npm run dev -- init
npm run dev -- analyze --dir /path/to/repo --verbose
npm run dev -- serve --dir /path/to/repo

# Build
npm run build

# Test built version
node dist/index.js --help
```

## Critical Files to Understand

1. **`src/commands/analyze.ts`** — The core value. Contains the AI system prompt that generates knowledge, the JSON extraction pipeline, and the orchestration. Most bugs will be here.
2. **`src/mcp/server.ts`** — The MCP server that agents connect to. 4 tools + resource listing. Uses `@modelcontextprotocol/sdk` Server class with stdio transport.
3. **`src/lib/ai-provider.ts`** — Multi-provider abstraction. Anthropic is streaming, OpenAI/Grok are standard, Gemini uses `@google/generative-ai`.

## Common Issues

### "Failed to parse AI response as JSON"
The AI wrapped its output in markdown fences or the response was truncated. The parser in `analyze.ts` handles most cases with `extractJSON()` → `fixJsonNewlines()` → `repairTruncatedJSON()`. If a new model produces a different format, add a strategy there.

### "Streaming is required for operations that may take longer than 10 minutes"
Anthropic SDK error. The Anthropic provider already uses `.stream()` — if you see this, someone switched back to `.create()`.

### Build produces no shebang
The `scripts/build.js` handles this. If `npm run build` doesn't produce a shebang in `dist/index.js`, check that script.

## What .context/ Looks Like (User's Repo)

```
.context/
├── index.md              # Quick orientation (30-60 lines)
├── facts/                # Architecture, database, deployment, API patterns
├── decisions/            # Why things are this way (prevents re-debating)
├── regressions/          # Known bugs and gotchas (prevents re-breaking)
├── sessions/             # AI session summaries (written via context_write)
├── changelog/            # Monthly git history syncs
├── .search.db            # FTS5 index (gitignored)
├── .gitignore            # Ignores .search.db
└── .last-sync            # Timestamp of last git sync
```

## Dependencies

- `@anthropic-ai/sdk` — Claude API (streaming)
- `@google/generative-ai` — Gemini API
- `openai` — OpenAI + Grok (Grok uses OpenAI-compatible endpoint at api.x.ai)
- `@modelcontextprotocol/sdk` — MCP server protocol
- `better-sqlite3` — FTS5 search index
- `commander` — CLI framework
- `chalk` — Terminal colors
- `glob` — File pattern matching
- `zod` — Schema validation (used by MCP SDK)

## Supported AI Providers

| Provider | Env Variable | Default Model | Notes |
|----------|-------------|---------------|-------|
| `anthropic` | `ANTHROPIC_API_KEY` | `claude-sonnet-4-5-20250929` | Streaming. Recommended. |
| `openai` | `OPENAI_API_KEY` | `gpt-4o` | Standard completions |
| `gemini` | `GEMINI_API_KEY` / `GOOGLE_API_KEY` | `gemini-2.0-flash` | Uses generateContent |
| `grok` | `GROK_API_KEY` / `XAI_API_KEY` | `grok-3` | OpenAI-compatible at api.x.ai |

## Don't

- Don't add embeddings/vector search without a clear need — FTS5 handles the current scale
- Don't change the `.context/` directory structure without updating `context-store.ts`, `search.ts`, AND `server.ts`
- Don't switch Anthropic back to non-streaming `create()` — it times out on large repos
- Don't hardcode provider-specific logic in `analyze.ts` — use `ai-provider.ts` abstraction
- Don't add heavy dependencies — this needs to install fast via `npx`
