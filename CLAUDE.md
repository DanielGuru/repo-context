# repomemory — Agent Instructions

## What This Is

A CLI tool + MCP server that gives AI coding agents persistent, structured memory for repositories. Agents can search, write, and delete knowledge that persists across sessions. Features hybrid keyword + semantic search, auto-session capture, intelligent category routing, and auto-purge detection.

**npm package:** `repomemory`
**Repo:** https://github.com/DanielGuru/repomemory

## Architecture

```
src/
├── index.ts                  # CLI entry point (Commander.js). 10 commands. Global error handlers.
├── commands/
│   ├── init.ts               # Scaffolds .context/ directory + .repomemory.json config.
│   │                           Exports CLAUDE_MD_BLOCK with MUST/ALWAYS agent instructions.
│   ├── analyze.ts            # AI-powered repo analysis. System prompt, orchestration,
│   │                           spinner, dry-run, merge mode, retry with backoff.
│   ├── sync.ts               # Reads git log → writes to .context/changelog/YYYY-MM.md
│   │                           with commit hash deduplication.
│   ├── serve.ts              # Thin wrapper that calls startMcpServer()
│   ├── setup.ts              # Configures 7 tools: Claude, Cursor, Copilot, Windsurf,
│   │                           Cline, Aider, Continue.
│   ├── status.ts             # Beautiful coverage bars, freshness indicators, suggestions.
│   ├── wizard.ts             # Interactive guided setup using @clack/prompts.
│   ├── dashboard.ts          # Localhost web UI with edit, server-side search, export.
│   ├── hook.ts               # Git post-commit hook install/uninstall.
│   └── go.ts                 # One-command setup: init + analyze + setup claude.
├── mcp/
│   └── server.ts             # MCP server. 6 tools + 2 prompts + resources.
│                               Session tracking, auto-capture on shutdown,
│                               intelligent category routing, auto-purge detection,
│                               progressive disclosure (compact/full), write-nudge.
└── lib/
    ├── ai-provider.ts        # Multi-provider abstraction (Anthropic, OpenAI, Gemini, Grok).
    │                           Anthropic uses streaming. Gemini uses systemInstruction.
    │                           AIError class with isRetryable. Cost estimation.
    ├── embeddings.ts          # Embedding provider abstraction (OpenAI, Gemini).
    │                           cosineSimilarity(). createEmbeddingProvider() with auto-detect.
    ├── config.ts              # Loads .repomemory.json with Zod validation. Single source
    │                           of DEFAULT_CONFIG truth. Embedding config fields.
    ├── context-store.ts       # CRUD + delete for .context/ files. Category validation.
    │                           Sanitized filenames. Freshness tracking in getStats().
    ├── search.ts              # sql.js (Wasm) FTS5 + optional vector search.
    │                           Hybrid scoring (alpha * keyword + (1-alpha) * semantic).
    │                           DB persistence (loads from disk on restart).
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
- **sql.js (Wasm)** — No native compilation needed. Install works everywhere instantly.
- **Hybrid search** — FTS5 keyword search + optional vector search via API-based embeddings (OpenAI/Gemini). Falls back gracefully to keyword-only when no embedding API key is available.
- **DB persistence** — Search DB loaded from disk on restart to avoid re-embedding. Fresh rebuild only when entry count changes.
- **Streaming for Anthropic** — SDK requires streaming for responses >10 minutes. Uses `stream()`, not `create()`.
- **JSON extraction pipeline** — Models wrap output in code fences or produce truncated JSON. `json-repair.ts` has multi-strategy parser. This is fragile — be careful changing it.
- **Progressive disclosure** — `context_search` returns compact one-line results by default (~50 tokens each). Use `detail="full"` for longer snippets.
- **Intelligent category routing** — `detectQueryCategory()` auto-routes queries to the right category based on keyword heuristics (e.g., "why X" → decisions, "bug in X" → regressions).
- **Auto-purge detection** — `context_write` checks for overlapping entries and warns about potential supersedes. Optional `supersedes` parameter for auto-delete.
- **Auto-session capture** — MCP server tracks all tool calls and auto-writes a session summary on graceful shutdown (SIGTERM/SIGINT).
- **6 categories** — facts, decisions, regressions, sessions, changelog, preferences (new in v1.1).
- **Zod config validation** — .repomemory.json is validated on load. Bad types get a warning, not a crash.
- **@clack/prompts for wizard** — Beautiful interactive CLI with spinner, select, multiselect, confirm.

## How to Work on This

```bash
# Install
npm install

# Dev (runs TypeScript directly)
npm run dev -- wizard
npm run dev -- go --dir /path/to/repo
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
| `go` | go.ts | One-command setup (init + analyze + setup) |
| `wizard` | wizard.ts | Interactive guided setup |
| `init` | init.ts | Scaffold .context/ |
| `analyze` | analyze.ts | AI analysis (--dry-run, --merge) |
| `sync` | sync.ts | Git history sync |
| `serve` | serve.ts | MCP server |
| `setup <tool>` | setup.ts | Tool integration (7 tools) |
| `status` | status.ts | Coverage + freshness |
| `dashboard` | dashboard.ts | Web UI on localhost:3333 |
| `hook <action>` | hook.ts | Git hook install/uninstall |

## MCP Tools

| Tool | Description |
|------|-------------|
| `context_search` | Hybrid FTS5 + vector search with intelligent category routing. Compact/full detail modes. |
| `context_write` | Write/append entries with auto-purge detection and supersedes support. |
| `context_delete` | Remove stale entries |
| `context_list` | List entries with compact/full modes |
| `context_read` | Read full content |
| `context_auto_orient` | One-call project orientation: index + sessions + recent changes + preferences |

## Common Issues

### "Failed to parse AI response as JSON"
The AI wrapped output in fences or was truncated. The parser in `json-repair.ts` handles most cases. If a new model produces a different format, add a strategy there.

### "Streaming is required for operations that may take longer than 10 minutes"
Anthropic SDK error. The provider already uses `.stream()`. If you see this, someone switched back to `.create()`.

### Build produces no shebang
`scripts/build.js` handles this. Check that script if `dist/index.js` doesn't have a shebang.

## Dependencies

- `@anthropic-ai/sdk` — Claude API (streaming)
- `@google/generative-ai` — Gemini API + embeddings
- `openai` — OpenAI + Grok + embeddings (text-embedding-3-small)
- `@modelcontextprotocol/sdk` — MCP server protocol
- `sql.js` — Wasm SQLite for FTS5 search (zero native deps)
- `commander` — CLI framework
- `chalk` — Terminal colors
- `ora` — Spinners for long operations
- `@clack/prompts` — Beautiful interactive CLI prompts
- `zod` — Schema validation

## Don't

- Don't change the `.context/` directory structure without updating `context-store.ts`, `search.ts`, AND `server.ts`
- Don't switch Anthropic back to non-streaming `create()` — it times out on large repos
- Don't hardcode provider-specific logic in `analyze.ts` — use `ai-provider.ts` abstraction
- Don't add heavy dependencies — this needs to install fast via `npx`
- Don't use execSync for git commands — use execFileSync to prevent shell injection
- Don't duplicate DEFAULT_CONFIG — it lives in `config.ts` only
- Don't add embedding logic outside `embeddings.ts` — it's the single abstraction for all providers
- Don't break the 7-tool integration (not just Claude Code)
- Don't make the MCP server depend on Claude Code hooks — it must work standalone with any MCP client
