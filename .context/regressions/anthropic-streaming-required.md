# Regression: Anthropic SDK Requires Streaming

## What Happened
Using `.create()` instead of `.stream()` with the Anthropic SDK causes a runtime error for long operations.

## Error Message
```
Streaming is required for operations that may take longer than 10 minutes
```

## Root Cause
The Anthropic SDK enforces streaming for long-running requests. The `analyze` command can take 2-5 minutes, which triggers this limit.

## Fix
`src/lib/ai-provider.ts` uses `.stream()` for all Anthropic calls.

## How to Prevent
**Never switch Anthropic calls from `.stream()` to `.create()`.**
If you see this error, someone changed the provider implementation.

## Status
Fixed in current codebase. Documented as a known pitfall in CLAUDE.md.