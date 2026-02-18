# Search System

## Overview
Hybrid search combining FTS5 keyword search (sql.js Wasm SQLite) with optional vector/semantic search.

## Key File: `src/lib/search.ts`

## How It Works
1. **FTS5 keyword search** — always available, uses sql.js (Wasm SQLite, no native deps)
2. **Vector search** — optional, requires embedding API key (Gemini `text-embedding-004` default, free; or OpenAI `text-embedding-3-small` as fallback)
3. **Hybrid scoring** — `alpha * keywordScore + (1 - alpha) * semanticScore`
4. **Fallback** — gracefully falls back to keyword-only when no embedding key available

## DB Persistence
- Search DB loaded from disk on restart to avoid re-embedding
- Fresh rebuild only when entry count changes
- Incremental `indexEntry()` and `removeEntry()` methods

## Intelligent Category Routing
- `detectQueryCategory()` auto-routes queries based on keyword heuristics
- "why X" → `decisions/`
- "bug in X" → `regressions/`
- "coding style" → `preferences/`
- If no results found in routed category, retries across all categories

## Progressive Disclosure
- `context_search` returns compact one-line summaries by default (~50 tokens each)
- Use `detail="full"` for longer snippets
- Reduces context window usage by ~10x

## Embeddings: `src/lib/embeddings.ts`
- `createEmbeddingProvider()` — auto-detects provider from available API keys
- `cosineSimilarity()` — pure function for vector comparison
- Configure via `embeddingProvider` field in `.repomemory.json`

## Configuration
```json
{
  "embeddingProvider": "gemini",  // or "openai" — gemini is default (free, strong on code)
  "searchAlpha": 0.5              // keyword vs semantic weight
}
```

## sql.js Notes
- Wasm-based — no native compilation, works everywhere
- FTS5 extension used for full-text search
- Custom type definitions in `src/types/sql.js.d.ts`
- FTS5 fallback in search handles cases where FTS5 isn't available