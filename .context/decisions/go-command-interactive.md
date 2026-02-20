# Decision: Make `go` Command Interactive

## What Changed
`repomemory go` now uses `@clack/prompts` to ask about:
1. Embedding provider — detects available API keys, lets user choose or skip
2. Max files for analysis — 80/150/300 options

Previously `go` was fully non-interactive, silently using defaults. This meant users got configs they didn't choose and didn't know about.

## Why
- `go` is what 90%+ of users run (not `wizard`)
- Embedding provider affects search quality significantly
- `maxFilesForAnalysis: 80` is too low for repos with 500+ files
- Users shouldn't need to hand-edit `.repomemory.json` for basic settings

## Config Update Behavior
- New setup: writes full config with chosen settings
- Existing `.repomemory.json`: updates missing fields (e.g., adds `embeddingProvider` if absent)
- Previously: `writeDefaultConfigFile()` skipped entirely if file existed — settings were silently lost

## Files
- `src/commands/go.ts` — rewrote to use @clack/prompts, writes config directly instead of through `writeDefaultConfigFile()`