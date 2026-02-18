<div align="center">

# repomemory

**Your codebase never forgets.**

AI agents lose context every session. repomemory fixes that.
One command analyzes your repo and creates a persistent knowledge base that any AI tool can search, read, and write to — with hybrid keyword + semantic search, auto-session capture, intelligent category routing, and **global developer context** that follows you across all repos.

[![npm version](https://img.shields.io/npm/v/repomemory.svg)](https://www.npmjs.com/package/repomemory)
[![license](https://img.shields.io/npm/l/repomemory.svg)](https://github.com/DanielGuru/repomemory/blob/main/LICENSE)
[![CI](https://github.com/DanielGuru/repomemory/actions/workflows/ci.yml/badge.svg)](https://github.com/DanielGuru/repomemory/actions)

```bash
npx repomemory go
```

</div>

---

## The Problem

Every time you open a project with Claude Code, Cursor, Copilot, or any AI coding agent:

- It re-discovers your architecture from scratch
- It re-reads the same files to understand patterns
- It proposes changes that were already debated and rejected
- It re-introduces bugs that were already fixed

Your CLAUDE.md / .cursorrules helps, but it's static and manually maintained. It gets stale.

## The Solution

repomemory creates a structured, searchable knowledge base that AI agents can **search, read, and write to** during sessions:

```
.context/
├── index.md              <- Quick orientation (loaded every session)
├── facts/
│   ├── architecture.md   <- Services, how they connect, deploy targets
│   ├── database.md       <- Schema overview, key tables, relationships
│   └── deployment.md     <- How to deploy, env vars, CI/CD
├── decisions/
│   ├── why-drizzle.md    <- "We chose Drizzle because X, not Prisma because Y"
│   └── auth-strategy.md  <- "JWT over sessions because Z"
├── regressions/
│   ├── sql-join-bug.md   <- "This broke before. Here's what happened."
│   └── token-refresh.md  <- "53-day cycle, don't touch without reading this"
├── preferences/          <- How YOU code (new in v1.1)
│   ├── coding-style.md   <- "Prefer functional components, TypeScript strict"
│   └── patterns.md       <- "Always use barrel exports, no default exports"
├── sessions/             <- AI session summaries (auto-captured on shutdown)
└── changelog/            <- Monthly git history syncs
```

**Facts** tell agents how things work. **Decisions** prevent re-debating. **Regressions** prevent re-breaking. **Preferences** teach agents how you code.

## Quick Start

### One-Command Setup

```bash
npx repomemory go
```

This single command:
1. Sets up your global developer profile (`~/.repomemory/global/`) — your preferences follow you everywhere
2. Creates `.context/` if it doesn't exist
3. Configures Claude Code MCP server if installed
4. Runs AI analysis if context is empty
5. Prints CLAUDE.md instructions to copy-paste

### Interactive Setup

```bash
npx repomemory wizard
```

The wizard walks you through provider selection, tool integration, and first analysis — all in one beautiful flow.

### Manual Setup

```bash
# 1. Initialize
npx repomemory init

# 2. Set your API key
export ANTHROPIC_API_KEY=sk-ant-...    # or OPENAI_API_KEY, GEMINI_API_KEY, GROK_API_KEY

# 3. Analyze your repo (2-5 min, uses AI)
npx repomemory analyze

# 4. Connect to your AI tool
npx repomemory setup claude     # Claude Code (MCP server auto-starts)
npx repomemory setup cursor     # Cursor
npx repomemory setup copilot    # GitHub Copilot
npx repomemory setup windsurf   # Windsurf
npx repomemory setup cline      # Cline
npx repomemory setup aider      # Aider
npx repomemory setup continue   # Continue

# 5. Commit to git — your team shares the knowledge
git add .context/ && git commit -m "Add repomemory knowledge base"
```

## Features

### MCP Server — AI Agents With Memory

The real power is the MCP server. It gives AI agents 6 tools to search, orient, read, write, and delete context:

```bash
npx repomemory serve
```

| Tool | What It Does |
|------|-------------|
| `context_search` | Hybrid keyword + semantic search across repo + global. Intelligent category routing. Optional `scope` filter. |
| `context_auto_orient` | One-call orientation: index, global + repo preferences, recent sessions, recent changes |
| `context_write` | Write entries with scope routing (preferences→global). Auto-purge detection. Supersedes. |
| `context_read` | Read full content. Repo-first, falls back to global. |
| `context_list` | Browse entries from both stores with `[repo]`/`[global]` provenance tags. |
| `context_delete` | Remove stale knowledge. Tries repo first, falls back to global. |

When configured via `repomemory setup claude`, the MCP server auto-starts with Claude Code:

```
Agent: "Let me orient myself in this project..."
-> context_auto_orient()
-> Returns: project overview, developer preferences, recent sessions, recent changes

Agent: "Let me search for context about the authentication flow..."
-> context_search("authentication flow")
-> Auto-routes to facts/ category, returns compact one-line results

Agent: "I discovered a race condition in token refresh. Let me record this."
-> context_write(category="regressions", filename="token-refresh-race", content="...")
-> Persisted. Detects if it supersedes an existing entry.
```

### What's New in v1.2

**Global Developer Context** — Your coding preferences now follow you across all repos. A global context store at `~/.repomemory/global/` is auto-created on first run. The `preferences/` category defaults to global scope — write once, available everywhere. Repo-level preferences override global when needed.

**Scope Routing** — All MCP tools gain an optional `scope` parameter (`"repo"` or `"global"`). Defaults are automatic: preferences go global, everything else stays repo-local. Search merges results from both stores with repo-first dedup.

**CLI: `repomemory global`** — New subcommand to manage global context directly: `list`, `read`, `write`, `delete`, `export`, `import`. Export/import enables backup and machine migration.

**Unicode Filename Handling** — Accented characters are now transliterated (café → cafe) instead of stripped to hyphens. NFKD normalization preserves readable filenames.

**Search Improvements** — Category column is now indexed in LIKE fallback search, so searching for "regressions" within the regressions category actually works. Score normalization no longer compresses ranges artificially.

### What's New in v1.1

<details>
<summary>v1.1 changelog</summary>

**Hybrid Search** — Keyword search (FTS5) + optional vector/semantic search via OpenAI or Gemini embeddings. Falls back to keyword-only when no embedding API key is available. Configure with `embeddingProvider` in `.repomemory.json`.

**Intelligent Category Routing** — Search queries are auto-routed to the most relevant category. "Why did we use X" routes to `decisions/`. "Bug in login" routes to `regressions/`. "Coding style" routes to `preferences/`. If no results found, retries across all categories.

**Auto-Session Capture** — The MCP server tracks all tool calls during a session and auto-writes a summary to `sessions/` when the server shuts down. Works with ALL MCP clients (Claude Code, Cursor, Copilot, Windsurf) — no hooks required.

**Progressive Disclosure** — Search returns compact one-line summaries by default (~50 tokens per result). Use `detail="full"` for longer snippets. Reduces context window usage by ~10x.

**Auto-Purge Detection** — When writing a new entry, the server checks for existing entries on the same topic and warns about potential supersedes. Use the `supersedes` parameter to auto-delete the old entry.

**Preferences Category** — New `preferences/` category for coding style, preferred patterns, tool configs, and formatting rules. Personal developer knowledge that persists across sessions.

**One-Command Setup** — `npx repomemory go` replaces the 4-step init + analyze + setup + copy flow.

**Dashboard Improvements** — Edit entries inline, server-side FTS5 search, real-time polling, JSON export, proper markdown rendering.

</details>

### Web Dashboard

Browse, search, and edit your context files in a beautiful local web UI:

```bash
npx repomemory dashboard
```

Opens `http://localhost:3333` with:
- Category filtering and server-side full-text search
- Inline editing with save
- Real-time polling for changes
- JSON export
- Proper markdown rendering

### Smart Analysis

```bash
# Full analysis
npx repomemory analyze

# Preview what would happen (no API call)
npx repomemory analyze --dry-run

# Update without overwriting your manual edits
npx repomemory analyze --merge

# Use a different provider or model
npx repomemory analyze --provider openai --model gpt-4o
```

Features:
- Cost estimation before running
- API key validation before expensive calls
- Retry with exponential backoff on failures
- Coverage report showing facts/decisions/regressions
- Merge mode that preserves manual edits

### Git Sync

```bash
npx repomemory sync
```

Syncs recent git commits to `changelog/YYYY-MM.md` with smart deduplication.

### Status & Coverage

```bash
npx repomemory status
```

Shows coverage bars, freshness indicators, stale file warnings, and suggestions.

## Supported Providers

| Provider | Models | Env Variable |
|----------|--------|-------------|
| `anthropic` | claude-sonnet-4-6, claude-opus-4-6 | `ANTHROPIC_API_KEY` |
| `openai` | gpt-4o, o3-mini | `OPENAI_API_KEY` |
| `gemini` | gemini-2.0-flash, gemini-2.5-pro | `GEMINI_API_KEY` / `GOOGLE_API_KEY` |
| `grok` | grok-3, grok-3-mini | `GROK_API_KEY` / `XAI_API_KEY` |

**Embeddings** (optional, for semantic search): OpenAI `text-embedding-3-small` or Gemini `text-embedding-004`. Auto-detected from available API keys.

## Supported AI Tools

| Tool | Integration | Command |
|------|------------|---------|
| **Claude Code** | MCP server (auto-starts) | `repomemory setup claude` |
| **Cursor** | .cursor/rules/ | `repomemory setup cursor` |
| **GitHub Copilot** | copilot-instructions.md | `repomemory setup copilot` |
| **Windsurf** | .windsurfrules | `repomemory setup windsurf` |
| **Cline** | .clinerules | `repomemory setup cline` |
| **Aider** | .aider.conf.yml | `repomemory setup aider` |
| **Continue** | .continue/rules/ | `repomemory setup continue` |

## All Commands

| Command | Description |
|---------|-------------|
| `repomemory go` | One-command setup — global profile + init + analyze + configure |
| `repomemory wizard` | Interactive guided setup (recommended for first use) |
| `repomemory init` | Scaffold `.context/` directory |
| `repomemory analyze` | AI-powered repo analysis |
| `repomemory analyze --dry-run` | Preview analysis without API call |
| `repomemory analyze --merge` | Update without overwriting edits |
| `repomemory sync` | Sync git history to changelog |
| `repomemory serve` | Start MCP server |
| `repomemory setup <tool>` | Configure AI tool integration |
| `repomemory status` | Show context coverage and freshness |
| `repomemory dashboard` | Open web dashboard |
| `repomemory hook install` | Auto-sync changelog on git commits |
| `repomemory global list` | List global developer context entries |
| `repomemory global export` | Export global context as JSON (for backup/migration) |

## Configuration

Create `.repomemory.json` in your repo root:

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-6",
  "contextDir": ".context",
  "maxFilesForAnalysis": 80,
  "maxGitCommits": 100,
  "ignorePatterns": [],
  "keyFilePatterns": [],
  "embeddingProvider": "openai",
  "hybridAlpha": 0.5,
  "enableGlobalContext": true,
  "globalContextDir": "~/.repomemory/global"
}
```

Custom `ignorePatterns` and `keyFilePatterns` are **additive** — they extend the built-in defaults, not replace them.

**Embedding config** (optional):
- `embeddingProvider`: `"openai"` or `"gemini"` — which API to use for embeddings
- `embeddingModel`: Override the default embedding model
- `embeddingApiKey`: Explicit API key for embeddings (falls back to env vars)
- `hybridAlpha`: Weight between keyword (1.0) and semantic (0.0) search. Default: 0.5

**Global context config**:
- `enableGlobalContext`: `true` (default) — set to `false` to disable global context and behave like v1.1
- `globalContextDir`: `"~/.repomemory/global"` (default) — path to global developer context

## How It Works

### Initial Analysis

1. **Scans** your repo — files, directories, languages, frameworks
2. **Reads** key files — package.json, configs, schemas, READMEs, CLAUDE.md
3. **Mines** git history — commits, contributors, change patterns
4. **Respects** .gitignore — won't scan ignored files
5. **Sends** everything to your AI model with a structured analysis prompt
6. **Writes** organized knowledge to `.context/`
7. **Indexes** all files for FTS5 full-text search + optional embeddings

### During Sessions (MCP Server)

- Agent orients itself with `context_auto_orient` at session start
- Agent searches for relevant context with intelligent category routing
- Agent writes discoveries, decisions, and preferences during work
- Auto-purge detection warns about superseded entries
- Session activity is auto-captured on server shutdown
- Knowledge accumulates session over session
- Next session starts with everything previous sessions learned

## Why Not Just Use CLAUDE.md?

| | CLAUDE.md | repomemory |
|--|-----------|-------------|
| **Maintenance** | Manual | AI-generated + agent-maintained |
| **Search** | Load everything | Hybrid keyword + semantic search |
| **Cross-tool** | Claude Code only | 7 AI tools supported |
| **Team knowledge** | One person writes | Every AI session contributes |
| **Decisions** | Mixed in with instructions | Structured, searchable |
| **Regressions** | Not tracked | Prevents repeat bugs |
| **Preferences** | Not tracked | Persists coding style preferences |
| **Freshness** | Unknown | Staleness detection + auto-purge |
| **Sessions** | Not tracked | Auto-captured on shutdown |

repomemory doesn't replace CLAUDE.md — it complements it. Your CLAUDE.md stays for instructions and rules. `.context/` holds the knowledge that grows over time.

## Contributing

See [CONTRIBUTING.md](.github/CONTRIBUTING.md) for development setup, testing, and contribution guidelines.

## License

MIT

---

<div align="center">

**Built for developers who are tired of AI agents forgetting everything between sessions.**

[Report Bug](https://github.com/DanielGuru/repomemory/issues) · [Request Feature](https://github.com/DanielGuru/repomemory/issues) · [npm](https://www.npmjs.com/package/repomemory)

</div>
