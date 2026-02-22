## Title
`feat: harden onboarding/reliability + doctor diagnostics + CI/release consistency`

## Summary
This PR implements the Codex review recommendations focused on adoption hardening and reliability (P0/P1), plus the current embedding defaults/perf work on this branch.

### What’s included

#### 1) Deterministic non-interactive onboarding
- `go` now supports: `--yes`, `--defaults`, `--no-prompt`, `--max-files`, `--embedding-provider none`
- `wizard` now supports deterministic flags: `--yes`, `--defaults`, `--no-prompt`, `--provider`, `--embedding-provider`, `--max-files`, `--tools`, `--skip-analyze`
- Better non-TTY/no-prompt behavior with sane defaults

#### 2) New `repomemory doctor` command
- Config parse + validity checks
- API key presence checks for configured providers
- `.context` structure/integrity checks
- Search index health probe
- MCP config checks (local/Claude)
- Supports `--json` and `--output <path>`
- Non-zero exit on failing checks (CI-friendly)

#### 3) Dashboard refresh/payload optimization
- `/api/entries` supports pagination (`offset`, `limit`)
- Compact mode (`compact=1`) and metadata mode (`meta=1`)
- ETag support + conditional requests
- Frontend polling switched to revision/meta checks instead of full payload reloads

#### 4) Test hardening
- New CLI e2e smoke tests (`tests/e2e/cli-smoke.test.ts`)
- New MCP contract tests (`tests/mcp-contract.test.ts`)
- Expanded coverage for critical user journeys and MCP tool sequence behavior

#### 5) Release consistency guardrails
- `scripts/sync-server-version.js`
- `scripts/check-release-consistency.js`
- New scripts in `package.json`: `sync:versions`, `check:release`, `typecheck`, `test:e2e`
- `server.json` version sync with `package.json`
- Changelog/README consistency checks

#### 6) Current branch feature work (already on this branch)
- Default embedding provider behavior updated toward Gemini auto-detect
- In-memory embedding cache/perf improvements

## Files of interest
- `src/commands/go.ts`
- `src/commands/wizard.ts`
- `src/commands/doctor.ts` (new)
- `src/commands/dashboard.ts`
- `src/index.ts`
- `scripts/check-release-consistency.js` (new)
- `scripts/sync-server-version.js` (new)
- `tests/e2e/cli-smoke.test.ts` (new)
- `tests/mcp-contract.test.ts` (new)
- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `README.md`, `CHANGELOG.md`, `server.json`, `package.json`

## Validation
All passing locally:
- `npm run check:release` ✅
- `npm run lint` ✅
- `npm test` ✅
- `npm run test:e2e` ✅
- `npm run build` ✅

## Notes
- Includes generated summary: `IMPLEMENTATION-SUMMARY.md`
- This branch intentionally focuses on trust/reliability hardening before net-new feature surface.

## Suggested merge strategy
- Squash merge recommended (large cross-cutting hardening PR)
