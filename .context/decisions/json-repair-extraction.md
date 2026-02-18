# Decision: Extract JSON Repair to Separate Module

## What Was Decided
`json-repair.ts` is a standalone module extracted from `analyze.ts` containing the multi-strategy JSON parsing pipeline.

## Functions
- `extractJSON()` — tries multiple strategies to find JSON in AI output
- `fixJsonNewlines()` — fixes literal newlines inside JSON strings
- `repairTruncatedJSON()` — attempts to close truncated JSON structures

## Why Extracted
- Testability — `tests/json-repair.test.ts` can test strategies in isolation
- AI models wrap output in code fences, produce truncated JSON, use different formats
- This is a known fragile area — isolation makes it safer to modify

## Warning
**This pipeline is fragile.** If a new AI model produces a different output format, add a new strategy to `json-repair.ts`. Do not change existing strategies without running the full test suite.

## Why It Exists
AI models frequently:
1. Wrap JSON in markdown code fences (```json ... ```)
2. Produce truncated JSON when output is long
3. Include literal newlines inside string values