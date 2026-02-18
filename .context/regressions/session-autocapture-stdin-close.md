# Regression: Session Auto-Capture Never Fires in Production

## What Broke
MCP server cleanup only registered `SIGTERM` and `SIGINT` handlers. MCP hosts (Claude Code, Cursor, Copilot) terminate by **closing stdin**, not sending signals. Session summaries were silently never written.

## Fix
Added `process.stdin.on("end", cleanup)` alongside the signal handlers in `server.ts`.

## Prevention
Test session capture by verifying the auto-session file exists after a simulated stdin close.