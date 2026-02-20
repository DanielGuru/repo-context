# CLI Search Command

## File: `src/commands/search.ts`

Added in v1.4.0. Searches repo + global context from the terminal.

## Usage
```bash
repomemory search <query>
repomemory search "auth flow" --category decisions
repomemory search "bug" --limit 5 --detail full
```

## Flags
- `-d, --dir <path>` — Repository root (default: cwd)
- `-c, --category <cat>` — Filter by category
- `-l, --limit <n>` — Max results (default: 10)
- `--detail <level>` — `compact` (default) or `full`

## Implementation
- Builds SearchIndex from repo store, optionally also from global store
- Merges results repo-first with dedup by `category/filename`
- Sorts by score descending
- Compact mode: one line per result with truncated snippet
- Full mode: multi-line with title, separator, snippet (up to 15 lines)
- Closes both indices on exit