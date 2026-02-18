# TypeScript Style Preferences

## Strict Mode
`tsconfig.json` has `"strict": true` — all strict TypeScript checks enabled.

## ESM Imports
All imports use `.js` extensions (required by `moduleResolution: nodenext`):
```typescript
import { foo } from './lib/config.js';  // correct
import { foo } from './lib/config';     // wrong
```

## No Default Exports (inferred)
The codebase uses named exports throughout. Functions and classes are exported by name.

## Error Handling
- Custom error classes (e.g., `AIError` in `ai-provider.ts`) with typed properties
- Zod validation for external data (config files) — warn on bad types, don't crash
- `execFileSync` over `exec`/`execSync` with shell strings to prevent injection

## Module Organization
- Commands in `src/commands/` — one file per CLI command
- Shared logic in `src/lib/` — pure utility modules
- MCP server in `src/mcp/server.ts`
- Types in `src/types/` for third-party type augmentation

## Async Patterns
- Async/await throughout (no callbacks, minimal raw Promises)
- Streaming for Anthropic API calls

## CLI UX Preferences
- `ora` for spinners on long operations
- `chalk` for terminal colors
- `@clack/prompts` for interactive prompts (wizard)
- Cost estimation shown before expensive operations
- `--dry-run` flag on destructive/expensive commands
- `--merge` flag to preserve manual edits