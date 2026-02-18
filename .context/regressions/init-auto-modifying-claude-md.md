# Regression: init Command Auto-Modified CLAUDE.md

## What Happened
Early versions of `repomemory init` automatically modified the user's `CLAUDE.md` file. This was considered too invasive.

## Root Cause
Design decision that was reversed — auto-modifying files the user owns is bad UX.

## Fix
Commit `b3cc6e0` — "Print CLAUDE.md instructions instead of auto-modifying files"
`src/commands/init.ts` now exports `CLAUDE_MD_BLOCK` and prints instructions for the user to copy-paste, rather than modifying files directly.

## How to Prevent
Do not auto-modify user-owned config files. Print instructions instead.