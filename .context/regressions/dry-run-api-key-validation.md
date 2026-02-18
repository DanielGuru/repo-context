# Regression: Dry-Run Mode Validated API Key Unnecessarily

## What Happened
`repomemory analyze --dry-run` was validating the API key even though dry-run mode doesn't make any API calls.

## Root Cause
API key validation was placed before the dry-run check in `src/commands/analyze.ts`.

## Fix
Fixed in commit `ea22f5d` — API key validation now skipped in dry-run mode.

## How to Prevent
Always check for `--dry-run` flag before performing any external validation or API calls in `analyze.ts`.