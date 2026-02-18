# Decision: Hybrid Keyword + Vector Search

## What Was Decided
Combine FTS5 keyword search with optional API-based vector embeddings using weighted hybrid scoring.

## Scoring Formula
`score = alpha * keywordScore + (1 - alpha) * semanticScore`

## Why
- Keyword search alone misses semantic similarity ("auth" vs "authentication")
- Vector search alone misses exact matches and is slower/costlier
- Hybrid gives best of both worlds
- Graceful fallback to keyword-only when no embedding API key configured

## Implementation
- FTS5 always runs (no API key needed)
- Vector search runs only when `embeddingProvider` configured in `.repomemory.json`
- DB persistence avoids re-embedding on restart (only rebuilds when entry count changes)
- Incremental `indexEntry()` / `removeEntry()` for live updates

## Added In
v1.1.0