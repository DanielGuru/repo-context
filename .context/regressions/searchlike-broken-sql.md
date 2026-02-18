# Regression: searchLike Completely Non-Functional

## What Broke
`search.ts` `searchLike()` used a column alias `score` in a SQL `WHERE` clause. SQLite does not support referencing column aliases in WHERE. The query always threw, the `catch` returned `[]`, meaning **keyword search was completely broken when FTS5 was unavailable**.

## Impact
Any sql.js build without FTS5 had zero working search. All queries silently returned empty results.

## Root Cause
```sql
-- BROKEN: SQLite can't reference alias in WHERE
SELECT ..., (CASE ... END) as score FROM documents WHERE score > 0

-- FIXED: Wrap in subquery
SELECT * FROM (SELECT ..., (CASE ... END) as score FROM documents) WHERE score > 0
```

## Fix
`search.ts` line 447-452: Wrapped the SELECT in a subquery so the alias `score` is available in the outer WHERE clause.

## Prevention
Add a test that exercises `searchLike` directly (not just through `search()` which prefers FTS5).