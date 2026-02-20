# Decision: Session Capture Threshold — Drop Duration Requirement

## What Was Decided
Changed auto-session capture from `toolCalls.length > 2 && duration > 60` to `writeCallMade || toolCalls.length > 2`. Duration was removed entirely as a signal.

## Why
A 30-second session where you find a critical regression and write it down is more valuable than a 5-minute idle session. The old threshold silently lost short productive sessions. Duration is a proxy for activity, but we already have better signals: whether anything was written, and how many tool calls were made.

## Alternatives Considered
- `writeCallMade || toolCalls > 3` — suggested by an agent, but > 3 is too conservative. 3 tool calls (search + read + search) is a meaningful session.
- Keep duration but lower it to 30s — still arbitrary and doesn't solve the fundamental issue.

## Location
`src/mcp/server.ts` line 1145 — the `hasActivity` variable in the cleanup handler.