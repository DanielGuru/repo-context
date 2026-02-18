## What This PR Does

A brief description of the changes in this pull request.

## Why

Explain the motivation. Link to any related issues (e.g., Fixes #123).

## How to Test

1. `npm install`
2. `npm run build`
3. Describe specific steps to verify the change works

## Checklist

- [ ] Code compiles without errors (`npm run build`)
- [ ] Tests pass (`npm test`)
- [ ] New functionality has tests (if applicable)
- [ ] All imports use `.js` extensions (ESM requirement)
- [ ] No hardcoded provider-specific logic in `analyze.ts` (use `ai-provider.ts` abstraction)
- [ ] `.context/` directory structure changes are reflected in `context-store.ts`, `search.ts`, and `server.ts`
- [ ] Updated CLAUDE.md if architecture changed significantly

## Type of Change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Refactor (no functional changes)
- [ ] Documentation
- [ ] CI/CD or tooling
