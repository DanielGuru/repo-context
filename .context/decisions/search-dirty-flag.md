# Decision: Dirty Flag for Search Index Saves

## Context
`SearchIndex.indexEntry()` and `removeEntry()` called `save()` after every operation, serializing the entire SQLite DB to disk each time. During batch operations (e.g., MCP server processing multiple writes), this was O(n) blocking disk writes per operation.

## Decision
Added a `dirty` flag. `indexEntry()` and `removeEntry()` set `dirty = true`. `close()` checks the flag and only writes to disk if dirty. `rebuild()` still calls `save()` directly since it's a full rebuild.

## Alternatives Considered
- Debounced save (setTimeout) — complex, risk of data loss on crash
- Write-ahead log — overkill for the use case
- Dirty flag with periodic flush — unnecessary since MCP server calls `close()` on shutdown

## Trade-offs
- Data is only persisted on explicit `close()` — if the process crashes between writes, the last few index updates are lost (but can be rebuilt from the .context/ files)
- This is acceptable because the index is a cache, not a source of truth