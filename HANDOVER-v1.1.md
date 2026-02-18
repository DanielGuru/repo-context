# repomemory v1.1 Handover — Build the Ultimate AI Memory System

## Your Mission

Transform repomemory from a good v1.0 into the definitive AI coding memory tool — one that makes claude-mem's 28.8k stars look like a warm-up. You have full authority to restructure, rewrite, and add anything needed.

## What repomemory Is

A CLI tool + MCP server that gives AI coding agents persistent, structured memory for repositories. Published to npm as `repomemory`, repo at https://github.com/DanielGuru/repomemory.

Currently at v1.0.4 on npm. 10 CLI commands, 5 MCP tools, 2 MCP prompts, 7 AI tool integrations, 106 tests.

## Current Architecture

```
src/
├── index.ts                  # CLI entry (Commander.js, 10 commands)
├── commands/
│   ├── init.ts               # Scaffolds .context/, prints CLAUDE.md instructions
│   ├── analyze.ts            # AI analysis with spinner, dry-run, merge, retry
│   ├── sync.ts               # Git log → changelog with hash deduplication
│   ├── serve.ts              # Starts MCP server
│   ├── setup.ts              # Configures 7 tools (writes to ~/.claude.json for Claude)
│   ├── status.ts             # Coverage bars, freshness, suggestions
│   ├── wizard.ts             # Interactive setup (@clack/prompts)
│   ├── dashboard.ts          # Localhost web UI with markdown rendering
│   └── hook.ts               # Git post-commit hook install/uninstall
├── mcp/
│   └── server.ts             # 5 tools + 2 prompts + resources + tool annotations
└── lib/
    ├── ai-provider.ts        # Anthropic (streaming), OpenAI, Gemini, Grok
    ├── config.ts              # Zod-validated .repomemory.json loading
    ├── context-store.ts       # CRUD + delete for .context/ files
    ├── search.ts              # sql.js with FTS5 fallback to LIKE queries
    ├── json-repair.ts         # JSON extraction/repair from AI output
    ├── git.ts                 # execFileSync (no shell injection)
    └── repo-scanner.ts        # .gitignore-aware, multi-ecosystem detection
```

Key deps: sql.js (Wasm SQLite), @clack/prompts, ora, chalk, commander, zod. Zero native deps.

## The Competition: claude-mem (28.8k stars)

GitHub: https://github.com/thedotmack/claude-mem

What they do:
- **Auto-captures** everything Claude does via lifecycle hooks (SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd)
- **AI-compresses** observations using Claude's agent SDK
- **Chroma vector search** + FTS5 hybrid for semantic retrieval
- **3-layer progressive disclosure**: search returns IDs (~50 tokens) → timeline shows context → get_observations fetches full details. ~10x token savings.
- **Web UI** at localhost:37777
- **Privacy control** via `<private>` tags
- SQLite + Python + Chroma + Bun

What they do worse than us:
- Requires Python + uv + Chroma (heavy install)
- Claude Code only — no Cursor, Copilot, Windsurf support
- No structured codebase knowledge on day one (starts empty, builds up)
- No regressions/decisions categories
- AGPL license (we're MIT)
- No dry-run / cost estimation
- No merge mode

## Critical Gaps Found During Live Testing

### Gap 1: Agent doesn't know HOW to use repomemory proactively

When a user opens Claude Code in a repo with repomemory configured, Claude sees the 5 MCP tools but doesn't automatically use them. In a live test, Claude said:

> "Your CLAUDE.md instructs me to use it... there may not be much stored yet. Want me to do an initial knowledge capture?"

But then when given an actual coding task, Claude didn't search context first — it went straight to reading files. The CLAUDE.md instructions help, but they're passive. Claude needs **stronger nudges** or **automatic behavior**.

**Ideas to fix:**
- The MCP `start-task` prompt should be more aggressive — maybe auto-triggered
- The tool descriptions need to be rewritten to emphasize proactive use
- Consider lifecycle hooks (like claude-mem) that auto-inject context at session start
- The CLAUDE.md block needs to be more authoritative — not "consider searching" but "YOU MUST search before any task"

### Gap 2: No auto-capture of session activity

claude-mem auto-captures what Claude does. We rely on Claude voluntarily calling `context_write`. In practice, Claude rarely writes back unless explicitly told. We need:
- Automatic session summaries at session end
- Auto-capture of significant discoveries (new patterns found, bugs fixed)
- Claude Code hooks integration (like claude-mem's lifecycle hooks)

### Gap 3: Keyword search is weak

Our search is LIKE-based with FTS5 fallback. Queries like "how does login work" won't find `facts/auth.md`. We need:
- Vector/semantic search (embeddings)
- Hybrid search (combine keyword + semantic scores)
- Progressive disclosure (return IDs first, expand on demand) to save tokens

### Gap 4: No way to auto-initialize in a new repo

When a user opens Claude Code in a repo that has `.context/` but hasn't been analyzed yet (fresh init), Claude doesn't know to run `repomemory analyze`. The gap between "tools are available" and "tools are useful" needs to be zero.

### Gap 5: First session experience is weak

The user runs init, analyze, setup. Then opens Claude Code. Claude... just sits there. There's no "wow" moment. No "here's what I know about your project." The first message from Claude in a repomemory-enabled repo should feel magical — it should KNOW things.

### Gap 6: CLAUDE.md instructions are too polite

Here's what happened in a live test on a real repo (MeatBar). Claude said:
> "Your CLAUDE.md instructs me to use it... there may not be much stored yet. Want me to do an initial knowledge capture?"

Then when given an actual coding task, Claude skipped context_search and went straight to reading files. The current CLAUDE.md block says "use context_search to find..." — that's a suggestion, not an instruction. It needs to say something like:

```
IMPORTANT: Before starting ANY task, you MUST call context_search with relevant
keywords. This is not optional. The knowledge base contains architecture docs,
past decisions, and known regressions that WILL save you from mistakes.
Do NOT skip this step even if the task seems simple.
```

### Gap 7: Empty state is confusing

When a user runs `init` but hasn't run `analyze` yet, Claude sees the MCP tools but context_search returns nothing useful. Claude doesn't know it should tell the user to run `analyze`. The MCP server should detect "init but not analyzed" state and return a helpful message like "Context is empty. The user needs to run `npx repomemory analyze` to populate it."

## What v1.1 Must Have

### 1. Vector/Semantic Search (Hybrid)

Add embedding-based search alongside keyword search. Options:
- Use the same AI provider (Anthropic/OpenAI/Gemini) for embeddings
- Store vectors in SQLite as BLOBs with cosine similarity
- Or use a lightweight embedding lib that runs locally (no API call)
- Hybrid scoring: combine keyword score + semantic score

The search must still work offline/without API keys (fallback to keyword).

### 2. Progressive Disclosure (Token-Efficient Retrieval)

Steal claude-mem's 3-layer pattern:
- Layer 1: `context_search` returns compact results (title, category, relevance score, first 100 chars) — ~50-100 tokens per result
- Layer 2: `context_read` gets the full content (existing tool)
- This is basically what we have but we need to trim the search results. Currently `context_search` returns 500-char snippets. Make it return shorter summaries by default with a `detail` parameter.

### 3. Auto-Session Capture

Add a way to automatically record what happened in a session:
- Create a Claude Code hook (PostToolUse or SessionEnd) that writes to sessions/
- Or make the MCP server track tool calls and auto-summarize on close
- The `end-session` prompt exists but is never triggered automatically

### 4. Stronger Agent Integration

The CLAUDE.md instructions are passive. Make them stronger:
- Rewrite the CLAUDE.md block to use MUST/ALWAYS/NEVER language
- Add a `context_auto_orient` tool that returns index.md + recent sessions + relevant context in one call (reduces tool calls from 3 to 1)
- The MCP server should expose a "session start" resource that Claude auto-reads

### 5. One-Command Setup

Merge init + analyze + setup into a single smart command:
```
npx repomemory go
```
This should:
- Detect if Claude Code is installed
- Add MCP server to ~/.claude.json if not there
- Create .context/ if not there
- Run analyze if .context/ is empty
- Print CLAUDE.md block
- All in one flow, with smart detection of what's already done

### 6. Plugin Distribution

claude-mem installs via `/plugin install`. We should too:
- Submit to Claude Code plugin marketplace (form: https://clau.de/plugin-directory-submission)
- The plugin structure already exists (.claude-plugin/, .mcp.json, skills/)
- But the skill and hook integration needs to actually work

### 7. Dashboard Improvements

Current dashboard is read-only with basic markdown rendering. Add:
- Edit capability (textarea + save button that writes via API)
- Search that hits the actual search index (not just JS filter)
- Real-time updates (poll for changes)
- Better markdown rendering (use a real lib or improve the regex renderer)
- Export/share capability

## Technical Context

- TypeScript ESM, `"type": "module"`, `.js` extensions in imports
- `moduleResolution: "nodenext"` in tsconfig
- sql.js (Wasm) — NO native deps, this is non-negotiable
- Tests: vitest, 106 tests in tests/ directory
- Build: `scripts/build.js` (tsc + shebang injection)
- CI: GitHub Actions, Node 18/20/22 matrix
- Default model: claude-sonnet-4-6

## Files to Read First

1. `src/mcp/server.ts` — The MCP server, where most improvements land
2. `src/lib/search.ts` — Search engine, needs vector search addition
3. `src/commands/init.ts` — The CLAUDE.md block that instructs agents
4. `src/commands/analyze.ts` — AI analysis pipeline
5. `CLAUDE.md` — Project instructions (read this to understand patterns)
6. `package.json` — Dependencies and scripts

## Don'ts

- Don't add Python/Chroma — stay pure Node.js, zero native deps
- Don't break the 7-tool integration (not just Claude Code)
- Don't make install slower — `npx` must stay instant
- Don't remove the MIT license
- Don't hardcode provider-specific logic outside ai-provider.ts

## The Bar

When you're done, a user should be able to:
1. Run ONE command to set up everything
2. Open Claude Code and have it AUTOMATICALLY search context before every task
3. Have Claude find semantically related knowledge (not just keyword matches)
4. See what Claude learned at the end of every session (auto-captured)
5. Browse, search, and edit their knowledge base in a beautiful web UI
6. Scale to repos with 500+ context files without performance issues

claude-mem has 28.8k stars with auto-capture + vector search + progressive disclosure.
We need all of that PLUS structured codebase knowledge + cross-tool support + zero deps + MIT license.

Make it happen.
