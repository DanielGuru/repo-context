<div align="center">

# repomemory

**Your codebase never forgets.**

AI agents lose context every session. repomemory fixes that.
One command analyzes your repo and creates a persistent knowledge base that any AI tool can search, read, and write to.

[![npm version](https://img.shields.io/npm/v/repomemory.svg)](https://www.npmjs.com/package/repomemory)
[![license](https://img.shields.io/npm/l/repomemory.svg)](https://github.com/DanielGuru/repomemory/blob/main/LICENSE)
[![CI](https://github.com/DanielGuru/repomemory/actions/workflows/ci.yml/badge.svg)](https://github.com/DanielGuru/repomemory/actions)

```bash
npx repomemory wizard
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

### Interactive Setup (Recommended)

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

The real power is the MCP server. It gives AI agents tools to search, read, write, and delete context:

```bash
npx repomemory serve
```

| Tool | What It Does |
|------|-------------|
| `context_search` | Full-text search across all knowledge |
| `context_write` | Write new facts, decisions, regressions, session notes |
| `context_read` | Read a specific context file |
| `context_list` | Browse all entries by category |
| `context_delete` | Remove stale or incorrect knowledge |

When configured via `repomemory setup claude`, the MCP server auto-starts with Claude Code:

```
Agent: "Let me search for context about the authentication flow..."
→ context_search("authentication flow")
→ Returns: facts/auth.md, decisions/jwt-over-sessions.md

Agent: "I discovered a race condition in token refresh. Let me record this."
→ context_write(category="regressions", filename="token-refresh-race", content="...")
→ Persisted. Next session will find it.
```

### Web Dashboard

Browse and search your context files in a beautiful local web UI:

```bash
npx repomemory dashboard
```

Opens `http://localhost:3333` with category filtering, full-text search, and file previews.

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
| `anthropic` | claude-sonnet-4-5, claude-opus-4-6 | `ANTHROPIC_API_KEY` |
| `openai` | gpt-4o, o3-mini | `OPENAI_API_KEY` |
| `gemini` | gemini-2.0-flash, gemini-2.5-pro | `GEMINI_API_KEY` / `GOOGLE_API_KEY` |
| `grok` | grok-3, grok-3-mini | `GROK_API_KEY` / `XAI_API_KEY` |

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

## Configuration

Create `.repomemory.json` in your repo root:

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-5-20250929",
  "contextDir": ".context",
  "maxFilesForAnalysis": 80,
  "maxGitCommits": 100,
  "ignorePatterns": [],
  "keyFilePatterns": []
}
```

Custom `ignorePatterns` and `keyFilePatterns` are **additive** — they extend the built-in defaults, not replace them.

## How It Works

### Initial Analysis

1. **Scans** your repo — files, directories, languages, frameworks
2. **Reads** key files — package.json, configs, schemas, READMEs, CLAUDE.md
3. **Mines** git history — commits, contributors, change patterns
4. **Respects** .gitignore — won't scan ignored files
5. **Sends** everything to your AI model with a structured analysis prompt
6. **Writes** organized knowledge to `.context/`
7. **Indexes** all files for FTS5 full-text search

### During Sessions (MCP Server)

- Agent searches for relevant context at task start
- Agent writes discoveries, decisions, and gotchas during work
- Agent can delete stale or incorrect knowledge
- Knowledge accumulates session over session
- Next session starts with everything previous sessions learned

## Why Not Just Use CLAUDE.md?

| | CLAUDE.md | repomemory |
|--|-----------|-------------|
| **Maintenance** | Manual | AI-generated + agent-maintained |
| **Search** | Load everything | FTS5 search, return only relevant |
| **Cross-tool** | Claude Code only | 7 AI tools supported |
| **Team knowledge** | One person writes | Every AI session contributes |
| **Decisions** | Mixed in with instructions | Structured, searchable |
| **Regressions** | Not tracked | Prevents repeat bugs |
| **Freshness** | Unknown | Staleness detection + warnings |

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
