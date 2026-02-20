# Comprehensive Audit of src/commands/ — 2026-02-18

## Scope
Full audit of all 11 files in `src/commands/`: analyze.ts, dashboard.ts, global.ts, go.ts, hook.ts, init.ts, serve.ts, setup.ts, status.ts, sync.ts, wizard.ts.

## Key Findings

### High Severity
1. **dashboard.ts:531** — XSS via unescaped provider/model in HTML template
2. **setup.ts:75** — Non-atomic write to ~/.claude.json risks corruption
3. **hook.ts:13** — `npx -y` in git hook auto-installs packages

### Medium Severity
4. **analyze.ts:279-318** — Merge-mode key mismatch vs store sanitization
5. **wizard.ts:179** — Wrong default model written when provider changed
6. **sync.ts:26-27** — .last-sync files not in .gitignore
7. **dashboard.ts:619-631** — Index mismatch in entry detail view
8. **init.ts:101-102** — Hardcoded Anthropic key example regardless of provider
9. **global.ts:115-132** — Import has no JSON validation or size limit

### Cross-Cutting
- Inconsistent home directory resolution (process.env vs os.homedir)
- process.exit() everywhere prevents testability
- SearchIndex lifecycle inconsistent (not always closed, not always error-handled)
- No --dir validation across all commands

## 28 total issues identified across 5 categories (bugs, security, UX, robustness, code quality).