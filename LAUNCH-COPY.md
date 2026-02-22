# repomemory Launch Copy
> Ready to copy-paste. Fill in `[DEMO GIF HERE]` once you have the recording.

---

## 1. Hacker News "Show HN"

**Title:** Show HN: repomemory – persistent, searchable memory for AI coding agents across sessions

**Body:**

Every time I started a new Claude Code or Cursor session, I'd spend the first 10 minutes re-explaining the project. The agent would re-propose the same architectural decisions we'd already rejected, re-introduce bugs we'd already fixed, and ask questions whose answers were scattered across dead conversation history. CLAUDE.md helped a little, but it's static and I kept forgetting to update it.

repomemory solves this with one command: `npx repomemory go`. It analyzes your repo and creates a `.context/` directory — structured knowledge base with facts, decisions, regressions, preferences, and session logs. An MCP server exposes 6 tools so any agent can search, read, and write to it during a session. Shutdown hooks auto-capture what happened. Global preferences follow you across repos.

Hybrid keyword + semantic search (Gemini embeddings, free tier). Works with Claude Code, Cursor, Copilot, Windsurf, Cline, Aider, Continue. MIT license.

Honest tradeoffs: it adds a setup step, the `.context/` dir needs occasional curation, and the quality of memory depends on agents actually writing back to it. Works best when you treat it as a first-class project artifact.

GitHub: https://github.com/DanielGuru/repomemory

---

## 2. Reddit r/LocalLLaMA

**Title:** Built a tool that gives your AI coding agent persistent memory without blowing up your context window

**Body:**

The naive solution to "my agent forgets everything between sessions" is to dump everything into the context. Project docs, CLAUDE.md, .cursorrules, previous decisions — just load it all. That works until your context is 80% boilerplate and you're burning tokens explaining things the agent already "knew" last week.

I built **repomemory** to do this properly: instead of loading everything, you retrieve only what's relevant.

`npx repomemory go` — one command. It creates a `.context/` knowledge base with facts, decisions, regressions, global preferences, and session logs. An MCP server gives agents 6 tools to search and write to that store during a session. Hybrid BM25 + semantic search (Gemini free tier embeddings) so retrieval is actually good.

Works with any agent that supports MCP: Claude Code, Cursor, Cline, Windsurf, Continue, Aider, Copilot. The context you actually load is minimal — a brief orientation block. The rest is pulled on demand.

The `.context/` dir is just markdown files. Version it, edit it, diff it. No proprietary format, no cloud lock-in. MIT license, open source.

https://github.com/DanielGuru/repomemory

Would be curious to hear from people using this with local models via Ollama + Continue — the MCP layer should be model-agnostic.

---

## 3. Reddit r/ClaudeAI

**Title:** I got tired of Claude Code re-discovering my project every session — so I built persistent memory for it via MCP

**Body:**

If you use Claude Code seriously, you've hit this: new session, new amnesia. You re-explain the architecture, it re-proposes the auth approach you already ruled out, it re-introduces the bug you fixed two weeks ago. The project context in CLAUDE.md helps but it's static — nobody updates it consistently, and it can't capture the reasoning behind decisions.

I built **repomemory** to fix this. It's an MCP server that gives Claude Code (and other agents) persistent, searchable memory across sessions.

**How it works:**
- `npx repomemory go` — analyzes your repo, sets up a `.context/` knowledge base in ~2 minutes
- Adds an MCP server to your Claude config automatically
- Claude gets 6 memory tools: `context_search`, `context_auto_orient`, `context_read`, `context_write`, `context_list`, `context_delete`
- At the start of a session, Claude orients itself. During work, it writes decisions and findings. On shutdown, the session is auto-captured.
- Global preferences (your coding style, preferred patterns, personal rules) follow you across every repo

The memory is hybrid keyword + semantic search, so retrieval is actually relevant, not just keyword matching.

MIT licensed, open source, free to run (uses Gemini free tier for embeddings). The `.context/` directory is just markdown — readable, versionable, editable by hand.

GitHub: https://github.com/DanielGuru/repomemory

Happy to answer questions about the MCP integration or how the session capture works.

---

## 4. X/Twitter Thread

**Tweet 1:**
Every AI coding session starts the same way: re-explaining the project. Re-debating decisions you already made. Watching it re-introduce bugs you already fixed.

Your agent doesn't have amnesia. It just has no memory.

Here's how I fixed that. 🧵

---

**Tweet 2:**
CLAUDE.md and .cursorrules are the duct-tape solution. They're static files you forget to update. They load everything into context whether it's relevant or not. They don't capture *why* decisions were made.

You need a living, searchable knowledge base. Not a config file.

---

**Tweet 3:**
I built repomemory. One command:

`npx repomemory go`

It analyzes your repo and creates a `.context/` directory — structured memory with facts, decisions, regressions, preferences, and session logs. Takes about 2 minutes.

[DEMO GIF HERE]

---

**Tweet 4:**
An MCP server gives your agent 6 tools:

→ context_search — hybrid keyword + semantic search
→ context_auto_orient — session startup summary
→ context_read — pull specific memory files
→ context_write — agents write back what they learn
→ context_list — browse the knowledge base
→ context_delete — prune stale entries

Agents read AND write. Memory grows with the project.

---

**Tweet 5:**
Session capture on shutdown means nothing gets lost. Global developer preferences follow you across every repo — your patterns, your style, your rules. Once written, always available.

@AnthropicAI's MCP protocol makes this possible. Claude Code gets dramatically better across sessions when it has real memory.

---

**Tweet 6:**
Works with 7 AI tools:
- Claude Code ✓
- Cursor ✓
- GitHub Copilot ✓
- Windsurf ✓
- Cline ✓
- Aider ✓
- Continue ✓

Not Claude-only. Whatever agent you're using.

---

**Tweet 7:**
The `.context/` dir is just markdown files. Version it with git. Edit it by hand. Diff it in PRs. No proprietary format. No cloud lock-in.

Gemini embeddings are free. Running this costs $0.

MIT license. Open source.

---

**Tweet 8:**
The honest version: it works best when agents are good at writing back to memory. You'll want to curate it occasionally. It's a tool, not magic.

But once it's set up? Starting a new session feels completely different.

---

**Tweet 9:**
GitHub: https://github.com/DanielGuru/repomemory

`npx repomemory go`

Try it on a real project. Would love to hear what breaks.

---

## 5. Product Hunt

**Tagline:** Persistent memory for AI coding agents across sessions

**Description:**
repomemory gives Claude Code, Cursor, Copilot, and 4 other agents a searchable `.context/` knowledge base that persists across sessions. One command setup. MCP server with 6 memory tools. Hybrid search. Global preferences that follow you across repos. Free to run. MIT licensed.

**First Comment (Maker Note):**

Hey PH 👋 — I built repomemory after getting genuinely frustrated with the amnesia problem in AI-assisted development. I'd start a session and spend the first 10-15 minutes re-orienting the agent. Same questions, same debates, same bugs being re-introduced. CLAUDE.md helped a little, but it's essentially a static text file that nobody consistently maintains. The agent reads it once and you still have to re-explain half the project.

The insight that unlocked this was: don't load everything into context, retrieve what's relevant. repomemory creates a structured `.context/` knowledge base from your repo — facts, architectural decisions, known regressions, developer preferences, past sessions — and exposes it through an MCP server. Agents search it at the start of a session, pull relevant context on demand, and write back what they learn. Session capture on shutdown means no knowledge is lost between conversations.

I kept it simple on purpose: `.context/` is just markdown files, versionable and editable by hand. Gemini embeddings are free tier so running cost is zero. MIT licensed. `npx repomemory go` and you're set up in 2 minutes. If you're a heavy AI coding agent user, I'd really value your feedback on what the memory structure is missing.

---

## 6. dev.to Blog Post

**Title:** Your AI coding agent has no memory. Here's how to fix that permanently.

**Opening paragraph:**

Every time you start a new Claude Code or Cursor session, your agent starts from zero. It doesn't know that you already debated and rejected the Redis approach three weeks ago. It doesn't know that the race condition in the auth middleware was the bug that took two days to find. It doesn't know you prefer functional patterns, or that the `payments` module is a no-touch zone until Q2. You've been compensating by stuffing notes into CLAUDE.md and .cursorrules — static files that get stale the moment they're written, and load into context whether they're relevant or not. There's a better way: give your agent a persistent, searchable knowledge base that grows with your project and costs nothing to run. That's what repomemory does, and this post shows you how to set it up in under 5 minutes.

---

## 7. Discord One-Liner

Hey — built something that might be useful if you're heavy on Claude Code / Cursor. It's called repomemory: `npx repomemory go` sets up a persistent `.context/` knowledge base for your repo + an MCP server so your agent can actually search and write memory across sessions. No more re-explaining the project every time. https://github.com/DanielGuru/repomemory — free, MIT, open source.

---

## 8. Awesome List PR Description

**repomemory** — Persistent, searchable memory for AI coding agents across sessions. Run `npx repomemory go` to analyze a repo and generate a structured `.context/` knowledge base (facts, decisions, regressions, preferences, session logs). The bundled MCP server exposes 6 tools enabling agents to retrieve relevant context on demand rather than loading everything into the prompt. Supports Claude Code, Cursor, GitHub Copilot, Windsurf, Cline, Aider, and Continue. Hybrid BM25 + semantic search via free Gemini embeddings. MIT licensed. https://github.com/DanielGuru/repomemory

---

## Launch Checklist

### Before posting anything:
- [ ] Record demo GIF (`vhs demo.tape` — vhs script is in the repo root)
- [ ] Swap `[DEMO GIF HERE]` in the X thread with the actual GIF
- [ ] Enable GitHub Discussions (Settings → Features)
- [ ] Add `.github/FUNDING.yml` with `github: DanielGuru`

### Launch day sequence:
1. Post to HN (~9am ET Thursday/Friday for best visibility)
2. X thread (same time)
3. r/LocalLLaMA
4. r/ClaudeAI
5. Claude Discord #mcp channel
6. Cursor Discord
7. r/programming (slightly later, different audience)

### Same week:
- [ ] dev.to article (full post, not just the intro)
- [ ] PR to awesome-mcp-servers
- [ ] PR to awesome-claude
- [ ] AI Engineers Discord

### Week 2+:
- [ ] Product Hunt (schedule properly, find a hunter)
- [ ] TLDR newsletter submission
- [ ] Lobste.rs
