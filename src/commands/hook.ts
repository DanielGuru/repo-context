import chalk from "chalk";
import { existsSync, mkdirSync, writeFileSync, chmodSync, readFileSync, unlinkSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";

const HOOK_MARKER_START = "# >>> repomemory start >>>";
const HOOK_MARKER_END = "# <<< repomemory end <<<";

const HOOK_CONTENT = `#!/bin/sh
${HOOK_MARKER_START}
# repomemory: auto-sync git history after commits
# Installed by: repomemory hook install
npx -y repomemory sync --dir "$(git rev-parse --show-toplevel)" 2>/dev/null &
${HOOK_MARKER_END}
`;

export async function hookCommand(action: string, options: { dir?: string }) {
  const repoRoot = options.dir || process.cwd();

  switch (action) {
    case "install":
      return installHook(repoRoot);
    case "uninstall":
      return uninstallHook(repoRoot);
    default:
      console.log(chalk.red(`Unknown action: ${action}`));
      console.log(chalk.dim("Usage: repomemory hook install | uninstall"));
      process.exit(1);
  }
}

function getHooksDir(repoRoot: string): string {
  // Respect core.hooksPath if set
  try {
    const custom = execFileSync("git", ["config", "core.hooksPath"], {
      cwd: repoRoot,
      encoding: "utf-8",
    }).trim();
    if (custom) return join(repoRoot, custom);
  } catch {
    // Not set — use default
  }
  return join(repoRoot, ".git", "hooks");
}

function installHook(repoRoot: string) {
  const gitDir = join(repoRoot, ".git");
  if (!existsSync(gitDir)) {
    console.log(chalk.red("\u2717 Not a git repository."));
    process.exit(1);
  }

  const hooksDir = getHooksDir(repoRoot);
  mkdirSync(hooksDir, { recursive: true });

  const hookPath = join(hooksDir, "post-commit");

  if (existsSync(hookPath)) {
    const existing = readFileSync(hookPath, "utf-8");
    if (existing.includes(HOOK_MARKER_START)) {
      console.log(chalk.yellow("\u26a0  post-commit hook already has repomemory."));
      return;
    }
    // Append to existing hook
    writeFileSync(hookPath, existing + "\n" + HOOK_CONTENT);
    console.log(chalk.green("\n\u2713 Appended repomemory sync to existing post-commit hook."));
  } else {
    writeFileSync(hookPath, HOOK_CONTENT);
    chmodSync(hookPath, "755");
    console.log(chalk.green("\n\u2713 Installed post-commit hook."));
  }

  console.log(chalk.dim("  Git will auto-sync context changelog after each commit."));
  console.log(chalk.dim(`  Hook: ${hookPath}`));
}

function uninstallHook(repoRoot: string) {
  const hooksDir = getHooksDir(repoRoot);
  const hookPath = join(hooksDir, "post-commit");

  if (!existsSync(hookPath)) {
    console.log(chalk.dim("  No post-commit hook found. Nothing to uninstall."));
    return;
  }

  const existing = readFileSync(hookPath, "utf-8");
  if (!existing.includes("repomemory")) {
    console.log(chalk.dim("  post-commit hook does not contain repomemory. Nothing to uninstall."));
    return;
  }

  // Prefer marker-based removal (new installs), fall back to line-matching (legacy)
  let remaining: string;
  const startIdx = existing.indexOf(HOOK_MARKER_START);
  const endIdx = existing.indexOf(HOOK_MARKER_END);

  if (startIdx !== -1 && endIdx !== -1) {
    const before = existing.slice(0, startIdx).trimEnd();
    const after = existing.slice(endIdx + HOOK_MARKER_END.length).trimStart();
    remaining = (before + (after ? "\n" + after : "")).trim();
  } else {
    // Legacy: remove individual repomemory lines
    const lines = existing.split("\n");
    const filtered = lines.filter((line) => !line.includes("repomemory") || line.startsWith("#!"));
    remaining = filtered.join("\n").trim();
  }

  if (remaining === "#!/bin/sh" || remaining === "") {
    // Hook is now empty — remove it
    unlinkSync(hookPath);
    console.log(chalk.green("\n\u2713 Removed post-commit hook (was repomemory-only)."));
  } else {
    writeFileSync(hookPath, remaining + "\n");
    console.log(chalk.green("\n\u2713 Removed repomemory from post-commit hook (other hooks preserved)."));
  }
}
