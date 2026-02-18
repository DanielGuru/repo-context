# repomemory

**Your repo remembers what every AI session learned.**

Persistent, structured memory for AI coding agents. Stop wasting the first 10 minutes of every session re-discovering your architecture.

```
npx repomemory init && npx repomemory analyze
```

That's it. Your repo now has a `.context/` directory with AI-generated knowledge that persists across sessions.

---

## The Problem

Every time you open a project with Claude Code, Cursor, Copilot, or any AI coding agent:

- It re-discovers your architecture from scratch
- It re-reads the same files to understand patterns
- It proposes changes that were already debated and rejected
- It re-introduces bugs that were already fixed

Your CLAUDE.md / .cursorrules helps, but it's a static file you manually maintain. It gets stale. It loads everything whether relevant or not.

## The Solution

`repomemory` creates a structured knowledge base that AI agents can search, read, and **write to** during sessions:

```
.context/
├── index.md              ← Quick orientation (loaded every session)
├── facts/
│   ├── architecture.md   ← Services, how they connect, deploy targets
│   ├── database.md       ← Schema overview, key tables, relationships
│   └── deployment.md     ← How to deploy, env vars, CI/CD
├── decisions/
│   ├── why-drizzle.md    ← "We chose Drizzle because X, not Prisma because Y"
│   └── auth-strategy.md  ← "JWT over sessions because Z"
├── regressions/
│   ├── sql-join-bug.md   ← "This broke before. Here's what happened."
│   └── token-refresh.md  ← "53-day cycle, don't touch without reading this"
├── sessions/             ← AI session summaries (auto-populated)
└── changelog/            ← Monthly git history syncs
```

**Facts** tell agents how things work. **Decisions** prevent re-debating. **Regressions** prevent re-breaking.

## Quick Start

### 1. Install and Initialize

```bash
npx repomemory init
```

### 2. Set Your API Key

```bash
# Pick one:
export ANTHROPIC_API_KEY=sk-ant-...    # Claude (recommended)
export OPENAI_API_KEY=sk-...           # GPT-4o
export GEMINI_API_KEY=...              # Gemini
export GROK_API_KEY=...                # Grok
```

### 3. Analyze Your Repo

```bash
npx repomemory analyze
```

This scans your entire codebase — file structure, key configs, database schemas, git history — and uses AI to generate structured knowledge files. Takes 2-5 minutes depending on repo size.

### 4. Connect to Your AI Tool

```bash
# Claude Code
npx repomemory setup claude

# Cursor
npx repomemory setup cursor

# GitHub Copilot
npx repomemory setup copilot
```

### 5. Commit to Git

```bash
git add .context/
git commit -m "Add repomemory knowledge base"
```

Your entire team now shares the knowledge.

## MCP Server

The real power is the MCP server, which gives AI agents tools to **search and write** context:

```bash
npx repomemory serve
```

### Tools Exposed

| Tool | What It Does |
|------|-------------|
| `context_search` | Search the knowledge base by natural language query |
| `context_write` | Write new knowledge (facts, decisions, regressions, session notes) |
| `context_list` | Browse all entries by category |
| `context_read` | Read a specific context file |

When configured via `repomemory setup claude`, the MCP server auto-starts with Claude Code. Your agent can:

```
Agent: "Let me search for context about the authentication flow..."
→ context_search("authentication flow")
→ Returns: facts/auth.md, decisions/jwt-over-sessions.md

Agent: "I discovered a race condition in token refresh. Let me record this."
→ context_write(category="regressions", filename="token-refresh-race", content="...")
→ Persisted. Next session will find it.
```

## Configuration

Create `.repomemory.json` in your repo root:

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-5-20250929",
  "contextDir": ".context",
  "maxFilesForAnalysis": 80,
  "maxGitCommits": 100,
  "autoIndex": true,
  "ignorePatterns": [],
  "keyFilePatterns": []
}
```

### Supported Providers

| Provider | Models | Env Variable |
|----------|--------|-------------|
| `anthropic` | claude-sonnet-4-5-20250929, claude-opus-4-6 | `ANTHROPIC_API_KEY` |
| `openai` | gpt-4o, o3-mini | `OPENAI_API_KEY` |
| `gemini` | gemini-2.0-flash, gemini-2.5-pro | `GEMINI_API_KEY` |
| `grok` | grok-3, grok-3-mini | `GROK_API_KEY` |

## Commands

| Command | Description |
|---------|-------------|
| `repomemory init` | Scaffold `.context/` directory |
| `repomemory analyze` | AI-powered repo analysis (generates all context files) |
| `repomemory sync` | Sync recent git history to `changelog/` |
| `repomemory serve` | Start MCP server for AI agent integration |
| `repomemory setup <tool>` | Configure Claude Code, Cursor, or Copilot |
| `repomemory status` | Show current context state |

### Options

```bash
# Use a specific provider
repomemory analyze --provider openai --model gpt-4o

# Analyze a different directory
repomemory analyze --dir /path/to/repo

# Verbose output
repomemory analyze --verbose
```

## How It Works

### Initial Analysis (`analyze`)

1. **Scans** your repo structure — files, directories, languages, frameworks
2. **Reads** key files — package.json, configs, schemas, READMEs, existing CLAUDE.md
3. **Mines** git history — commits, contributors, change patterns, activity
4. **Sends** everything to your chosen AI model with a structured analysis prompt
5. **Writes** organized knowledge to `.context/` — facts, decisions, regressions
6. **Indexes** all files for full-text search via the MCP server

### During Sessions (MCP Server)

- Agent searches for relevant context at task start
- Agent writes discoveries, decisions, and gotchas during work
- Knowledge accumulates session over session
- Next agent session has access to everything previous sessions learned

### Git Sync (`sync`)

```bash
repomemory sync
```

Reads recent git commits and writes them to `changelog/YYYY-MM.md`. Run periodically or as a post-merge hook.

## Why Not Just Use CLAUDE.md?

| | CLAUDE.md | repomemory |
|--|-----------|-------------|
| **Maintenance** | Manual | AI-generated + agent-maintained |
| **Search** | Load everything | FTS5 search, return only relevant |
| **Cross-tool** | Claude Code only | Claude, Cursor, Copilot, any MCP client |
| **Team knowledge** | One person writes | Every AI session contributes |
| **Decisions** | Mixed in with instructions | Structured, searchable, prevents re-debating |
| **Regressions** | Not tracked | Explicit files preventing repeat bugs |

`repomemory` doesn't replace CLAUDE.md — it complements it. Your CLAUDE.md stays for instructions and rules. `.context/` holds the knowledge that grows over time.

## Inspired By

- **[OpenClaw](https://github.com/openclaw/openclaw)** — The memory architecture (tiers, temporal decay, hybrid search) inspired this project. OpenClaw remembers *you*. repomemory remembers *your codebase*.
- **[Aider](https://aider.chat/)** — Repo maps and convention files showed the value of structured context.
- **Context Engineering** — The emerging discipline of curating what AI models see for better outcomes.

## License

MIT

---

**Built for developers who are tired of AI agents forgetting everything between sessions.**
