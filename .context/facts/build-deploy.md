# Build & Deployment

## Build
```bash
npm run build        # runs scripts/build.js
npm run prepublishOnly  # same as build (runs before npm publish)
```

## Build Script: `scripts/build.js`
- Custom build script (not tsc directly)
- Compiles TypeScript to `dist/`
- **Adds shebang** to `dist/index.js` — critical for CLI usage
- If `dist/index.js` lacks `#!/usr/bin/env node`, check this script

## TypeScript Config
- `target: ES2022`
- `module: NodeNext` + `moduleResolution: nodenext`
- `strict: true`
- `outDir: dist`, `rootDir: src`
- Generates declarations + source maps
- **All imports in source must use `.js` extensions** (ESM + nodenext requirement)

## Published Files
```
dist/          # compiled output
README.md
LICENSE
.claude-plugin/
.mcp.json
skills/
server.json
```

## npm Package
- Name: `repomemory`
- Binary: `repomemory` → `dist/index.js`
- Exports: `.` → `dist/index.js`, `./mcp` → `dist/mcp/server.js`
- `npx repomemory go` works without install

## Dev Workflow
```bash
npm run dev -- <command> [options]  # runs via tsx (no build needed)
npm run dev -- wizard
npm run dev -- analyze --dir /path/to/repo --verbose
npm run dev -- serve --dir /path/to/repo
npm run dev -- dashboard
```

## Node Requirement
Node.js ≥ 18.0.0