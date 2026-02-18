# Decision: Custom Build Script Instead of Plain tsc

## What Was Decided
Use `scripts/build.js` instead of calling `tsc` directly in the build script.

## Why
- `tsc` doesn't add a shebang line to the output
- CLI tools distributed via npm need `#!/usr/bin/env node` at the top of the entry file
- The custom script runs tsc then post-processes `dist/index.js` to add the shebang

## Impact
If `dist/index.js` doesn't have a shebang after build, the CLI won't work when installed globally or via npx. Always check `scripts/build.js` if this happens.

## Alternative Considered
- Adding shebang to source: doesn't work with TypeScript compilation
- Using a bundler (esbuild, rollup): adds complexity, rejected for simplicity