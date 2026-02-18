# repomemory — Agent Instructions

## What This Is

A CLI tool + MCP server that gives AI coding agents persistent, structured memory for repositories. Agents can search, write, and delete knowledge that persists across sessions.

**npm package:** `repomemory`
**Repo:** https://github.com/DanielGuru/repomemory

## Architecture

```
src/
├── index.ts                  # CLI entry point (Commander.js). 9 commands. Global error handlers.
├── commands/
│   ├── init.ts               # Scaffolds .context/ directory + .repomemory.json config
│   ├── analyze.ts            # AI-powered repo analysis. System prompt, orchestration,
│   │                           spinner, dry-run, merge mode, retry with backoff.
│   ├── sync.ts               # Reads git log → writes to .context/changelog/YYYY-MM.md
│   │                           with commit hash deduplication.
│   ├── serve.ts              # Thin wrapper that calls startMcpServer()
│   ├── setup.ts              # Configures 7 tools: Claude, Cursor, Copilot, Windsurf,
│   │                           Cline, Aider, Continue.
│   ├── status.ts             # Beautiful coverage bars, freshness indicators, suggestions.
│   ├── wizard.ts             # Interactive guided setup using @clack/prompts.
│   └── dashboard.ts          # Localhost web UI for browsing context files.
├── mcp/
│   └── server.ts             # MCP server. 5 tools: context_search, context_write,
│                               context_delete, context_list, context_read.
│                               Input validation, incremental indexing, graceful shutdown.
└── lib/
    ├── ai-provider.ts        # Multi-provider abstraction (Anthropic, OpenAI, Gemini, Grok).
    │                           Anthropic uses streaming. Gemini uses systemInstruction.
    │                           AIError class with isRetryable. Cost estimation.
    ├── config.ts              # Loads .repomemory.json with Zod validation. Single source
    │                           of DEFAULT_CONFIG truth.
    ├── context-store.ts       # CRUD + delete for .context/ files. Category validation.
    │                           Sanitized filenames. Freshness tracking in getStats().
    ├── search.ts              # sql.js (Wasm) FTS5 search index. No native compilation.
    │                           Incremental indexEntry() and removeEntry() methods.
    ├── json-repair.ts         # JSON extraction/repair pipeline. extractJSON, fixJsonNewlines,
    │                           repairTruncatedJSON. Extracted from analyze.ts for testability.
    ├── git.ts                 # Git info extraction using execFileSync (no shell injection).
    │                           getLastCommitHash() for sync deduplication.
    └── repo-scanner.ts        # Walks repo tree respecting .gitignore, detects languages/
                                frameworks across JS, Python, Rust, Go, Ruby ecosystems.
```

## Key Technical Decisions

- **TypeScript + ESM** — `"type": "module"` in package.json. All imports use `.js` extensions. `moduleResolution: "nodenext"` in tsconfig.
- **sql.js (Wasm)** — Replaced better-sqlite3. No native compilation needed. Install works everywhere instantly.
- **Streaming for Anthropic** — SDK requires streaming for responses >10 minutes. Uses `stream()`, not `create()`.
- **JSON extraction pipeline** — Models wrap output in code fences or produce truncated JSON. `json-repair.ts` has multi-strategy parser. This is fragile — be careful changing it.
- **FTS5 for search** — sql.js with FTS5 virtual tables. Porter stemming + unicode61 tokenizer. AND semantics by default, falls back to OR if no results.
- **Zod config validation** — .repomemory.json is validated on load. Bad types get a warning, not a crash.
- **@clack/prompts for wizard** — Beautiful interactive CLI with spinner, select, multiselect, confirm.

## How to Work on This

```bash
# Install
npm install

# Dev (runs TypeScript directly)
npm run dev -- wizard
npm run dev -- analyze --dir /path/to/repo --verbose
npm run dev -- serve --dir /path/to/repo
npm run dev -- dashboard

# Build
npm run build

# Test
npm test

# Test built version
node dist/index.js --help
```

## CLI Commands

| Command | File | Description |
|---------|------|-------------|
| `wizard` | wizard.ts | Interactive guided setup |
| `init` | init.ts | Scaffold .context/ |
| `analyze` | analyze.ts | AI analysis (--dry-run, --merge) |
| `sync` | sync.ts | Git history sync |
| `serve` | serve.ts | MCP server |
| `setup <tool>` | setup.ts | Tool integration (7 tools) |
| `status` | status.ts | Coverage + freshness |
| `dashboard` | dashboard.ts | Web UI on localhost:3333 |

## MCP Tools

| Tool | Description |
|------|-------------|
| `context_search` | FTS5 search with fallback text search |
| `context_write` | Write/append entries with incremental indexing |
| `context_delete` | Remove stale entries |
| `context_list` | List entries with age indicators |
| `context_read` | Read full content |

## Common Issues

### "Failed to parse AI response as JSON"
The AI wrapped output in fences or was truncated. The parser in `json-repair.ts` handles most cases. If a new model produces a different format, add a strategy there.

### "Streaming is required for operations that may take longer than 10 minutes"
Anthropic SDK error. The provider already uses `.stream()`. If you see this, someone switched back to `.create()`.

### Build produces no shebang
`scripts/build.js` handles this. Check that script if `dist/index.js` doesn't have a shebang.

## Dependencies

- `@anthropic-ai/sdk` — Claude API (streaming)
- `@google/generative-ai` — Gemini API
- `openai` — OpenAI + Grok (Grok uses OpenAI-compatible endpoint at api.x.ai)
- `@modelcontextprotocol/sdk` — MCP server protocol
- `sql.js` — Wasm SQLite for FTS5 search (zero native deps)
- `commander` — CLI framework
- `chalk` — Terminal colors
- `ora` — Spinners for long operations
- `@clack/prompts` — Beautiful interactive CLI prompts
- `zod` — Schema validation

## Don't

- Don't add embeddings/vector search without a clear need — FTS5 handles the current scale
- Don't change the `.context/` directory structure without updating `context-store.ts`, `search.ts`, AND `server.ts`
- Don't switch Anthropic back to non-streaming `create()` — it times out on large repos
- Don't hardcode provider-specific logic in `analyze.ts` — use `ai-provider.ts` abstraction
- Don't add heavy dependencies — this needs to install fast via `npx`
- Don't use execSync for git commands — use execFileSync to prevent shell injection
- Don't duplicate DEFAULT_CONFIG — it lives in `config.ts` only
