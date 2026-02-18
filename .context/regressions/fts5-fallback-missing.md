# Regression: FTS5 Not Available in All sql.js Builds

## What Happened
FTS5 extension is not guaranteed to be available in all sql.js builds. Search would fail with an error instead of falling back.

## Root Cause
The initial implementation assumed FTS5 was always available in sql.js.

## Fix
`src/lib/search.ts` has FTS5 fallback handling — if FTS5 isn't available, falls back to a simpler search approach.

## Fixed In
Commit `ea22f5d` — "Fix dry-run API key validation, ESM require in dashboard, FTS5 fallback in search"

## How to Prevent
Always test search functionality after updating sql.js version.