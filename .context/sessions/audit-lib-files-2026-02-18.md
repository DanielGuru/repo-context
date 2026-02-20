## Comprehensive audit of src/lib/ files — 2026-02-18

Performed deep audit of all 8 files in `src/lib/`. Found 67 issues total.

### Critical findings:
1. **searchLike is broken** — `search.ts` line 451: uses column alias `score` in WHERE clause, which SQLite doesn't support. LIKE fallback silently returns empty results when FTS5 is unavailable.
2. **Path traversal in readEntry** — `context-store.ts` line 166: raw filename used in join() + readFileSync before sanitization. Could read files outside .context/.
3. **`.github` and dotdirs skipped** — `repo-scanner.ts` line 145: hidden dirs unconditionally filtered, making `.github/workflows/*.yml` keyFilePattern dead code.

### High severity:
- Gemini errors all marked retryable (ai-provider.ts:250)
- Embedding blob byteOffset not handled (search.ts:271-272, 301)
- Race condition in ensureDb (search.ts:63-107)
- Git log `|` delimiter breaks on commit messages with `|` (git.ts:109-149)
- Default branch detection substring match (git.ts:67-69)

### Medium severity:
- listEntries reads all content for metadata-only ops (context-store.ts:200)
- extractJSON doesn't handle arrays (json-repair.ts:22-28)
- .gitignore parsing missing negation, path patterns (repo-scanner.ts:79-92)
- save() on every individual operation (search.ts:323,332)
- Non-atomic DB migration (search.ts:82-96)

See full audit for 67 total issues across all categories.