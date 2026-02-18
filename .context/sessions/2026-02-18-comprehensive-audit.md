# Comprehensive Audit Session — 2026-02-18

## What We Did
1. Ran 6 parallel audit agents across ALL source files (lib/, commands/, server.ts, index.ts, tests, docs)
2. Identified 100+ issues across bugs, security, UX, tests, and community gaps
3. Applied **53 fixes** across two rounds (my audit + second agent's audit)
4. All 163 tests pass, build clean

## Critical Fixes
- `searchLike` broken SQL (column alias in WHERE) — core search was non-functional without FTS5
- Path traversal in `readEntry` and `listEntries` — security vulnerability
- Dotdir exclusion blocking `.github/workflows` detection
- Session auto-capture never firing (stdin close, not signals)
- Gemini errors all marked retryable (infinite retry loops)
- `context_delete` not using `resolveScope` for preferences

## Key Decisions
- Changed git log delimiter from `|` to null byte `%x00` (prevents author name parsing bugs)
- Added dirty flag to SearchIndex (save on close, not every write)
- Pre-compiled detectQueryCategory regexes as module constants
- Changed auto-purge threshold from magic `5.0` to relative `maxScore * 0.3`

## Files Changed
search.ts, context-store.ts, repo-scanner.ts, git.ts, ai-provider.ts, json-repair.ts, server.ts, dashboard.ts, init.ts, wizard.ts, global.ts, hook.ts, sync.ts, index.ts, package.json, tsconfig.json, server.json, build.js, LICENSE, release.yml, CONTRIBUTING.md + new: CODE_OF_CONDUCT.md, SECURITY.md, dependabot.yml, MARKETING-TODO.md

## What's Left
- Marketing tasks documented in `docs/MARKETING-TODO.md` (GIF, logo, README restructure, blog post, docs site)
- Test coverage still ~40% — repo-scanner, ai-provider, MCP server handlers, all CLI commands untested
- No `repomemory search` CLI command (core feature missing from terminal)
- Git post-commit hook not installed on this repo