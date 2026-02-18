# Decision: TypeScript ESM + NodeNext Module Resolution

## What Was Decided
Use `"type": "module"` in package.json with `module: NodeNext` and `moduleResolution: nodenext` in tsconfig.

## Consequence
**All imports in `.ts` source files must use `.js` extensions** (not `.ts`), even though the files are TypeScript. This is the ESM + NodeNext requirement.

```typescript
// Correct
import { foo } from './lib/config.js';

// Wrong — will fail at runtime
import { foo } from './lib/config';
import { foo } from './lib/config.ts';
```

## Why
- Modern ESM compatibility
- Works with Node.js native ESM without transpilation at runtime
- Required for `npx` usage and clean npm package distribution

## Alternatives Considered
- CommonJS: rejected (legacy, worse tree-shaking)
- `moduleResolution: bundler`: rejected (not appropriate for CLI tools)

## Impact
Every new file added to `src/` must follow `.js` extension convention in imports.