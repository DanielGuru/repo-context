import chalk from "chalk";
import { loadConfig } from "../lib/config.js";
import { startMcpServer } from "../mcp/server.js";

export async function serveCommand(options: { dir?: string }) {
  const repoRoot = options.dir || process.cwd();
  const config = loadConfig(repoRoot);

  // Only log to stderr so stdout is clean for MCP protocol
  console.error(chalk.dim(`repomemory MCP server starting...`));
  console.error(chalk.dim(`  Root: ${repoRoot}`));
  console.error(chalk.dim(`  Context: ${config.contextDir}/`));

  await startMcpServer(repoRoot, config);
}
