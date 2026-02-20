# Regression: context_write Called listEntries() on Every Write

## What Broke
The `context_write` handler in `server.ts` called `targetStore.listEntries(category)` after every write just to find the entry it just wrote, so it could pass it to `indexEntry()`. This read every `.md` file in the category directory — O(n) file reads per write. With 50 entries in `facts/`, that's 50 unnecessary readFileSync calls.

## Location
`src/mcp/server.ts` — the incremental index update block after write/append.

## Fix
Construct the `ContextEntry` directly from the data already in scope (content, relativePath from write result, title extracted from content). No filesystem scan needed.

## Prevention
Don't call `listEntries()` when you already have the data. If you need a single entry, read it directly.