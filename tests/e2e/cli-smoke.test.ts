import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execFileSync, spawnSync } from "child_process";

function runCli(args: string[], cwd: string): { stdout: string; stderr: string } {
  const env = {
    ...process.env,
    CI: "1",
    NO_COLOR: "1",
  };

  const stdout = execFileSync("npx", ["tsx", "src/index.ts", ...args], {
    cwd,
    encoding: "utf8",
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  return { stdout, stderr: "" };
}

describe("CLI E2E smoke", () => {
  let fixtureRoot: string;

  beforeEach(() => {
    fixtureRoot = mkdtempSync(join(tmpdir(), "repomemory-e2e-"));
    mkdirSync(join(fixtureRoot, "src"), { recursive: true });
    writeFileSync(join(fixtureRoot, "README.md"), "# Fixture repo\n");
    writeFileSync(join(fixtureRoot, "src", "index.ts"), "export const hello = 'world';\n");
  });

  afterEach(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it("go --yes initializes non-interactively", () => {
    const out = runCli(
      [
        "go",
        "--dir",
        fixtureRoot,
        "--yes",
        "--no-prompt",
        "--skip-analyze",
        "--provider",
        "anthropic",
        "--embedding-provider",
        "none",
        "--max-files",
        "80",
      ],
      process.cwd()
    );

    expect(out.stdout).toContain("repomemory go");
    expect(existsSync(join(fixtureRoot, ".context"))).toBe(true);
    expect(existsSync(join(fixtureRoot, ".repomemory.json"))).toBe(true);

    const cfg = JSON.parse(readFileSync(join(fixtureRoot, ".repomemory.json"), "utf8"));
    expect(cfg.maxFilesForAnalysis).toBe(80);
  });

  it("fails fast for invalid non-interactive provider", () => {
    const result = spawnSync(
      "npx",
      ["tsx", "src/index.ts", "go", "--dir", fixtureRoot, "--yes", "--provider", "bogus"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, CI: "1", NO_COLOR: "1" },
      }
    );

    expect(result.status).toBe(1);
    expect((result.stdout + result.stderr).toLowerCase()).toContain("invalid provider");
  });

  it("doctor emits json report", () => {
    runCli(["init", "--dir", fixtureRoot], process.cwd());
    const outputPath = join(fixtureRoot, "doctor-report.json");
    const out = runCli(["doctor", "--dir", fixtureRoot, "--json", "--output", outputPath], process.cwd());

    const report = JSON.parse(out.stdout);
    expect(report.summary).toBeDefined();
    expect(existsSync(outputPath)).toBe(true);
  });

  it("setup + status + search smoke", () => {
    runCli(["init", "--dir", fixtureRoot], process.cwd());
    runCli(["setup", "cursor", "--dir", fixtureRoot], process.cwd());

    expect(existsSync(join(fixtureRoot, ".cursor", "rules", "repomemory.mdc"))).toBe(true);

    const status = runCli(["status", "--dir", fixtureRoot], process.cwd());
    expect(status.stdout).toContain("repomemory status");

    // Verify search runs without crashing (may return results from global context)
    const search = runCli(["search", "architecture", "--dir", fixtureRoot], process.cwd());
    expect(search.stdout).toBeDefined();
  });
});
