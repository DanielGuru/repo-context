---
name: repomemory
description: Search and manage your repository's persistent knowledge base. Use this to find architecture docs, past decisions, known regressions, and session notes before starting work.
allowed-tools: Bash, Read, Grep
---

# repomemory — Repository Memory

You have access to the repomemory MCP server which provides persistent knowledge for this codebase.

## When invoked

If the user says `/repomemory` or `/repomemory <query>`:

1. If a query is provided via $ARGUMENTS, search for it:
   - Use the `context_search` MCP tool with the query
   - Display the results clearly

2. If no query is provided, show an overview:
   - Use `context_list` to show all available knowledge
   - Highlight any stale entries (>60 days old)
   - Suggest searching for specific topics

## Always

- Use `context_search` BEFORE starting any task to find relevant context
- Use `context_write` to record discoveries, decisions, and gotchas during your session
- Use `context_delete` to remove stale or incorrect knowledge
- Be specific when writing: include file paths, function names, and commands
