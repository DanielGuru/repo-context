# Regression: Global Search Index Had No Lazy-Init Fallback

## What Broke
In `server.ts`, the repo search index had lazy-init on first search (if `.context/` existed but index was null, rebuild it). The global search index did NOT have this — if it failed to initialize at startup (lines 149-160), it stayed `null` forever. Users with global context could silently lose all global search results.

## Fix
Added mirror lazy-init block in `context_search` handler: if `globalExists && globalStore && !globalSearchIndex`, create and rebuild the index.

## Location
`src/mcp/server.ts` — in the `context_search` case, after the repo lazy-init block.