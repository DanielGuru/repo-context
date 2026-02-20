# Rejected Feature Ideas — 2026-02-18

Evaluated 11 suggestions from agent feedback. Rejected these with reasoning:

## context_reflect tool
Would require LLM call inside MCP server, breaking standalone requirement. The real problem (agents forget to write) is prompt engineering, not tool engineering. Write-nudge already addresses this.

## content_sanitize / injection guard
Security theater. `.context/` is local, written by user's own agent. A poisoned client can do far worse than write bad entries. For shared repos, code review on `.context/` changes is the answer.

## LRU embedding cache
Document embeddings already cached as BLOBs in SQLite. Query embedding cache would save ~5% of calls — not the "10x" claimed. Minor optimization, not worth the complexity.

## Two-stage LLM reranker
Adds 200-500ms + API cost per search. Typical knowledge base is 20-100 entries — FTS5 + vector hybrid is already three levels of ranking. Over-engineered for the scale.

## context_health MCP tool
Agents don't need health reports. The CLI `status` command already serves this for humans debugging "why doesn't the agent know X."

## Unified audit log
`.context/` is committed to git. Growing `.audit.jsonl` pollutes history. Sessions + `git log -- .context/` already cover the debugging use case.

## Session idempotency
Non-issue. `appendEntry()` already handles same-day sessions correctly. Double-fire prevented by `cleanupDone` guard.