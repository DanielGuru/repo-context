# Testing

## Framework
Vitest (`vitest.config.ts`)

## Commands
```bash
npm test          # vitest run (single pass)
npm run test:watch  # vitest (watch mode)
```

## Test Files
| File | What It Tests |
|------|---------------|
| `tests/config.test.ts` | Config loading, Zod validation |
| `tests/context-store.test.ts` | CRUD operations, category validation, filename sanitization |
| `tests/embeddings.test.ts` | Embedding provider abstraction, cosineSimilarity |
| `tests/git.test.ts` | Git info extraction |
| `tests/json-repair.test.ts` | JSON extraction/repair pipeline strategies |
| `tests/search.test.ts` | FTS5 search, hybrid scoring, category routing |
| `tests/server-helpers.test.ts` | MCP server helper functions |

## Notes
- Tests are in `tests/` directory (excluded from tsconfig compilation)
- v1.1.0 added 199 lines of search tests, 155 lines of server-helper tests, 91 lines of embedding tests
- v1.1.1 added 35+ lines to context-store tests and 9+ to server-helpers
- Tests run against TypeScript source via tsx (not compiled dist)

## Coverage Areas
- `json-repair.ts` extracted from `analyze.ts` specifically for testability
- sql.js Wasm search is tested (search.test.ts)
- Embedding providers tested with mocks