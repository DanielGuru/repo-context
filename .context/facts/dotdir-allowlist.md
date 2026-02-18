# Fact: Repo Scanner Dotdir Allowlist

The repo scanner (`src/lib/repo-scanner.ts`) filters out all directories starting with `.` during the tree walk. An explicit allowlist exists for useful dotdirs:

```typescript
const ALLOWED_DOTDIRS = new Set([".github", ".vscode", ".cursor"]);
```

This means:
- `.github/workflows/*.yml` files ARE now discoverable by `keyFilePatterns`
- `.vscode/` and `.cursor/` config dirs ARE scanned
- All other dotdirs (`.git`, `.cache`, `.turbo`, etc.) are still excluded

To add a new dotdir to the scan, add it to `ALLOWED_DOTDIRS` in `repo-scanner.ts`.