import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ContextStore } from "../src/lib/context-store.js";
import { DEFAULT_CONFIG } from "../src/lib/config.js";

function textFromTool(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content
    .filter((c) => c.type === "text")
    .map((c) => c.text || "")
    .join("\n");
}

describe("MCP contract", () => {
  let repoDir: string;
  let homeDir: string;
  let client: Client | null = null;
  let transport: StdioClientTransport | null = null;

  beforeEach(async () => {
    repoDir = mkdtempSync(join(tmpdir(), "repomemory-mcp-"));
    homeDir = mkdtempSync(join(tmpdir(), "repomemory-home-"));

    const store = new ContextStore(repoDir, DEFAULT_CONFIG);
    store.scaffold();
    store.writeIndex("# Test Project\n");
    store.writeEntry("facts", "auth-flow", "# Auth Flow\nJWT-based auth pipeline.");

    mkdirSync(join(homeDir, ".repomemory"), { recursive: true });
    writeFileSync(join(repoDir, ".repomemory.json"), JSON.stringify({ enableGlobalContext: true }, null, 2) + "\n");

    transport = new StdioClientTransport({
      command: "npx",
      args: ["tsx", "src/index.ts", "serve", "--dir", repoDir],
      cwd: process.cwd(),
      env: {
        ...process.env,
        HOME: homeDir,
      } as Record<string, string>,
      stderr: "pipe",
    });

    client = new Client({ name: "repomemory-test-client", version: "1.0.0" }, { capabilities: {} });
    await client.connect(transport);
  });

  afterEach(async () => {
    if (client) {
      await client.close();
      client = null;
    }
    if (transport) {
      await transport.close();
      transport = null;
    }
    rmSync(repoDir, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
  });

  it("supports list/read/write/delete/search/orient contract", async () => {
    const tools = await client!.listTools();
    const names = tools.tools.map((t) => t.name);

    expect(names).toContain("context_search");
    expect(names).toContain("context_write");
    expect(names).toContain("context_read");
    expect(names).toContain("context_delete");
    expect(names).toContain("context_auto_orient");

    const write = await client!.callTool({
      name: "context_write",
      arguments: {
        category: "facts",
        filename: "billing-flow",
        content: "# Billing Flow\nStripe webhooks drive invoicing.",
      },
    });
    expect(textFromTool(write)).toContain("Written");

    const read = await client!.callTool({
      name: "context_read",
      arguments: {
        category: "facts",
        filename: "billing-flow",
      },
    });
    expect(textFromTool(read)).toContain("Stripe webhooks");

    const search = await client!.callTool({
      name: "context_search",
      arguments: {
        query: "billing webhooks",
        category: "facts",
      },
    });
    expect(textFromTool(search).toLowerCase()).toContain("billing");

    const orient = await client!.callTool({
      name: "context_auto_orient",
      arguments: {},
    });
    expect(textFromTool(orient)).toContain("Project Overview");

    const remove = await client!.callTool({
      name: "context_delete",
      arguments: {
        category: "facts",
        filename: "billing-flow",
      },
    });
    expect(textFromTool(remove)).toContain("Deleted");
  });

  it("routes preferences to global scope by default", async () => {
    const writePref = await client!.callTool({
      name: "context_write",
      arguments: {
        category: "preferences",
        filename: "style-guide",
        content: "# Style\nPrefer small pure functions.",
      },
    });

    expect(textFromTool(writePref)).toContain("[global]");

    const readGlobal = await client!.callTool({
      name: "context_read",
      arguments: {
        category: "preferences",
        filename: "style-guide",
      },
    });
    expect(textFromTool(readGlobal)).toContain("[global]");
    expect(textFromTool(readGlobal)).toContain("small pure functions");

    const globalPath = join(homeDir, ".repomemory", "global", "preferences", "style-guide.md");
    expect(existsSync(globalPath)).toBe(true);
  });
});
