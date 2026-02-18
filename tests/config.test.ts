import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { loadConfig, DEFAULT_CONFIG } from "../src/lib/config.js";

describe("loadConfig", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "repomemory-config-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns defaults when no config file exists", () => {
    const config = loadConfig(tempDir);
    expect(config.provider).toBe("anthropic");
    expect(config.model).toBe(DEFAULT_CONFIG.model);
    expect(config.contextDir).toBe(".context");
    expect(config.maxFileSize).toBe(100_000);
    expect(config.maxFilesForAnalysis).toBe(80);
    expect(config.maxGitCommits).toBe(100);
    expect(config.autoIndex).toBe(true);
    expect(config.categories).toEqual([
      "facts",
      "decisions",
      "regressions",
      "sessions",
      "changelog",
    ]);
  });

  it("returns a copy of defaults (not the same reference)", () => {
    const config1 = loadConfig(tempDir);
    const config2 = loadConfig(tempDir);
    expect(config1).not.toBe(config2);
    expect(config1).toEqual(config2);
  });

  it("merges user config with defaults", () => {
    const userConfig = {
      provider: "openai",
      model: "gpt-4o-mini",
      maxFileSize: 50_000,
    };
    writeFileSync(
      join(tempDir, ".repomemory.json"),
      JSON.stringify(userConfig)
    );

    const config = loadConfig(tempDir);
    expect(config.provider).toBe("openai");
    expect(config.model).toBe("gpt-4o-mini");
    expect(config.maxFileSize).toBe(50_000);
    // Defaults for fields not specified
    expect(config.maxGitCommits).toBe(DEFAULT_CONFIG.maxGitCommits);
    expect(config.autoIndex).toBe(DEFAULT_CONFIG.autoIndex);
  });

  it("handles invalid JSON gracefully (returns defaults)", () => {
    writeFileSync(join(tempDir, ".repomemory.json"), "not valid json {{{");

    const config = loadConfig(tempDir);
    expect(config.provider).toBe("anthropic");
    expect(config.model).toBe(DEFAULT_CONFIG.model);
  });

  it("handles empty JSON object (returns defaults)", () => {
    writeFileSync(join(tempDir, ".repomemory.json"), "{}");

    const config = loadConfig(tempDir);
    expect(config.provider).toBe("anthropic");
    expect(config.model).toBe(DEFAULT_CONFIG.model);
    expect(config.ignorePatterns).toEqual(DEFAULT_CONFIG.ignorePatterns);
  });

  it("Zod validation catches bad provider type and returns defaults", () => {
    const badConfig = { provider: "not-a-real-provider" };
    writeFileSync(
      join(tempDir, ".repomemory.json"),
      JSON.stringify(badConfig)
    );

    // loadConfig prints a warning and returns defaults when validation fails
    const config = loadConfig(tempDir);
    expect(config.provider).toBe("anthropic");
  });

  it("Zod validation catches negative maxFileSize and returns defaults", () => {
    const badConfig = { maxFileSize: -100 };
    writeFileSync(
      join(tempDir, ".repomemory.json"),
      JSON.stringify(badConfig)
    );

    const config = loadConfig(tempDir);
    // Zod's .positive() rejects negative numbers, so loadConfig returns defaults
    expect(config.maxFileSize).toBe(DEFAULT_CONFIG.maxFileSize);
  });

  it("Zod validation catches wrong type for autoIndex and returns defaults", () => {
    const badConfig = { autoIndex: "yes" };
    writeFileSync(
      join(tempDir, ".repomemory.json"),
      JSON.stringify(badConfig)
    );

    const config = loadConfig(tempDir);
    expect(config.autoIndex).toBe(DEFAULT_CONFIG.autoIndex);
  });

  it("ignorePatterns are additive (user patterns appended to defaults)", () => {
    const userConfig = {
      ignorePatterns: ["my-custom-dir", "*.log"],
    };
    writeFileSync(
      join(tempDir, ".repomemory.json"),
      JSON.stringify(userConfig)
    );

    const config = loadConfig(tempDir);
    // Should contain all default patterns plus user patterns
    expect(config.ignorePatterns).toContain("node_modules");
    expect(config.ignorePatterns).toContain(".git");
    expect(config.ignorePatterns).toContain("my-custom-dir");
    expect(config.ignorePatterns).toContain("*.log");
    expect(config.ignorePatterns.length).toBe(
      DEFAULT_CONFIG.ignorePatterns.length + 2
    );
  });

  it("keyFilePatterns are additive (user patterns appended to defaults)", () => {
    const userConfig = {
      keyFilePatterns: ["custom-config.yaml"],
    };
    writeFileSync(
      join(tempDir, ".repomemory.json"),
      JSON.stringify(userConfig)
    );

    const config = loadConfig(tempDir);
    expect(config.keyFilePatterns).toContain("package.json");
    expect(config.keyFilePatterns).toContain("custom-config.yaml");
    expect(config.keyFilePatterns.length).toBe(
      DEFAULT_CONFIG.keyFilePatterns.length + 1
    );
  });

  it("categories are replaced (not additive) when specified by user", () => {
    const userConfig = {
      categories: ["notes", "todos"],
    };
    writeFileSync(
      join(tempDir, ".repomemory.json"),
      JSON.stringify(userConfig)
    );

    const config = loadConfig(tempDir);
    expect(config.categories).toEqual(["notes", "todos"]);
  });

  it("accepts all valid provider values", () => {
    for (const provider of ["anthropic", "openai", "gemini", "grok"]) {
      writeFileSync(
        join(tempDir, ".repomemory.json"),
        JSON.stringify({ provider })
      );
      const config = loadConfig(tempDir);
      expect(config.provider).toBe(provider);
    }
  });

  it("preserves contextDir when specified", () => {
    const userConfig = { contextDir: ".my-context" };
    writeFileSync(
      join(tempDir, ".repomemory.json"),
      JSON.stringify(userConfig)
    );

    const config = loadConfig(tempDir);
    expect(config.contextDir).toBe(".my-context");
  });
});
