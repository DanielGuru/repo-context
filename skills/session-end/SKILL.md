---
name: session-end
description: Record what you accomplished and discovered during this session. Routes conclusions to the right categories.
allowed-tools: Bash, Read, Grep
---

# Session End

When invoked (`/session-end`):

1. Summarize what was accomplished in this session
2. Route knowledge to the RIGHT categories — do NOT dump everything into sessions/:
   - New architectural facts -> `context_write(category="facts", ...)`
   - Decisions made -> `context_write(category="decisions", ...)`
   - Bugs/regressions found -> `context_write(category="regressions", ...)`
   - Coding style preferences -> `context_write(category="preferences", ...)`
   - The session overview itself -> `context_write(category="sessions", ...)`
3. Include: files changed, decisions made, issues encountered, things learned
4. Be specific: include file paths, function names, and commands
