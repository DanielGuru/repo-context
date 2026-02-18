# Regression: ESM require() in Dashboard

## What Happened
The dashboard command used `require()` which is not available in ESM modules.

## Root Cause
The project uses `"type": "module"` (ESM), so `require()` is not available. The dashboard was using it for dynamic imports.

## Fix
Fixed in commit `ea22f5d` — replaced `require()` with proper ESM `import()` dynamic imports in `src/commands/dashboard.ts`.

## How to Prevent
Never use `require()` in this codebase. Use `import()` for dynamic imports. All files are ESM.