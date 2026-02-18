# Regression: Path Traversal in readEntry and listEntries

## What Broke
- `readEntry()` used the raw unsanitized `filename` in `path.join()` before trying the sanitized fallback. A filename like `../../secrets.md` could read files outside `.context/`.
- `listEntries(category)` had no category validation — any string was joined directly into a path.
- `context_read` MCP handler accepted empty string `""` as category (falsy, bypassed validation).

## Impact
Security vulnerability. MCP clients could potentially read arbitrary `.md` files outside the context directory.

## Fix (3 changes)
1. `context-store.ts` `readEntry()`: Always sanitize filename first, removed unsanitized path check.
2. `context-store.ts` `listEntries()`: Added `validateCategory()` call when category is provided.
3. `server.ts` `context_read`: Changed guard from `if (category && ...)` to `if (!category || ...)`.

## Prevention
Add tests for path traversal attempts in `readEntry` and `listEntries`.