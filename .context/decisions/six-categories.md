# Decision: Six Fixed Knowledge Categories

## What Was Decided
The `.context/` directory has exactly 6 fixed categories:
1. `facts` — how things work
2. `decisions` — why choices were made
3. `regressions` — known bugs and fixes
4. `sessions` — auto-captured AI session summaries
5. `changelog` — monthly git history
6. `preferences` — developer coding style and patterns (added v1.1)

## Why Fixed Categories
- Enables intelligent category routing (`detectQueryCategory()` in `search.ts`)
- Consistent structure across all repos using repomemory
- Category validation in `context-store.ts` prevents typos
- Agents learn the taxonomy and can route queries correctly

## Why These Six
- `facts/decisions/regressions` — the core knowledge types (what/why/what-went-wrong)
- `sessions` — auto-capture requires a dedicated category
- `changelog` — git sync needs its own space (date-based filenames)
- `preferences` — added v1.1 for personal developer knowledge

## Enforcement
`context-store.ts` validates category on write. Invalid categories are rejected.