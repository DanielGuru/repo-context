import chalk from "chalk";
import { loadConfig } from "../lib/config.js";
import { startMcpServer } from "../mcp/server.js";

export async function serveCommand(options: { dir?: string }) {
  const repoRoot = options.dir || process.cwd();
  const config = loadConfig(repoRoot);

  // Only log to stderr so stdout is clean for MCP protocol
  console.error(chalk.dim(`repomemory MCP server v0.2.0`));
  console.error(chalk.dim(`  Root: ${repoRoot}`));
  console.error(chalk.dim(`  Context: ${config.contextDir}/`));
  console.error(chalk.dim(`  Tools: context_search, context_write, context_delete, context_list, context_read`));

  await startMcpServer(repoRoot, config);
}
