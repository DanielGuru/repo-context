---
name: session-start
description: Orient yourself at the start of a coding session. Loads project context, recent sessions, and relevant knowledge automatically.
allowed-tools: Bash, Read, Grep
---

# Session Start

When invoked (`/session-start`):

1. Call `context_auto_orient` to get full project orientation in one call
2. Display the results: project overview, recent sessions, developer preferences, recently updated entries
3. If the context is empty, suggest running `npx repomemory analyze`
4. If the user mentioned a specific task, also run `context_search` with relevant keywords
