import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ContextStore } from "../lib/context-store.js";
import { SearchIndex } from "../lib/search.js";
import type { RepoContextConfig } from "../lib/config.js";

const VALID_CATEGORIES = ["facts", "decisions", "regressions", "sessions", "changelog"];

export async function startMcpServer(
  repoRoot: string,
  config: RepoContextConfig
): Promise<void> {
  const store = new ContextStore(repoRoot, config);
  let searchIndex: SearchIndex | null = null;

  if (store.exists()) {
    try {
      searchIndex = new SearchIndex(store.path, store);
      await searchIndex.rebuild();
    } catch (e) {
      console.error("Warning: Could not initialize search index:", e);
    }
  }

  const server = new Server(
    {
      name: "repomemory",
      version: "0.2.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  // --- Tools ---

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "context_search",
          description:
            "Search the repository's persistent knowledge base. Returns relevant facts, decisions, regressions, and session notes. Use this FIRST at the start of every task to find relevant context, or when you need to understand why something is the way it is. This prevents re-discovering architecture and re-debating past decisions.",
          inputSchema: {
            type: "object" as const,
            properties: {
              query: {
                type: "string",
                description:
                  "Natural language search query. Examples: 'authentication flow', 'why we chose Drizzle', 'database schema', 'known issues with deployment'",
              },
              category: {
                type: "string",
                enum: VALID_CATEGORIES,
                description:
                  "Optional: filter results to a specific category. Omit to search all.",
              },
              limit: {
                type: "number",
                description: "Max results to return (default: 5)",
              },
            },
            required: ["query"],
          },
          annotations: {
            title: "Search Context",
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
        },
        {
          name: "context_write",
          description:
            "Write a new piece of knowledge to the repository's persistent memory. Use this to record: discoveries you made during this session, architectural decisions, bug patterns, or any insight that would help a future AI session. This persists across sessions — write anything you'd want a future version of yourself to know.",
          inputSchema: {
            type: "object" as const,
            properties: {
              category: {
                type: "string",
                enum: VALID_CATEGORIES,
                description: `Category for the knowledge:
- facts: Architecture, patterns, how things work
- decisions: Why something was chosen (include alternatives considered)
- regressions: Bug patterns, things that broke, gotchas
- sessions: What you worked on and discovered this session
- changelog: Notable changes`,
              },
              filename: {
                type: "string",
                description:
                  "Descriptive filename (without .md extension). Use kebab-case. Examples: 'auth-flow', 'why-drizzle-orm', 'token-refresh-race-condition'",
              },
              content: {
                type: "string",
                description:
                  "Markdown content to write. Be specific: include file paths, function names, commands. Every line should inform a decision.",
              },
              append: {
                type: "boolean",
                description:
                  "If true, append to existing file instead of overwriting. Useful for session logs.",
              },
            },
            required: ["category", "filename", "content"],
          },
          annotations: {
            title: "Write Context",
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
          },
        },
        {
          name: "context_delete",
          description:
            "Delete a knowledge entry from the repository context. Use this to remove stale or incorrect information. Knowledge quality matters more than quantity — prune aggressively.",
          inputSchema: {
            type: "object" as const,
            properties: {
              category: {
                type: "string",
                enum: VALID_CATEGORIES,
                description: "The category of the entry to delete.",
              },
              filename: {
                type: "string",
                description: "The filename to delete (with or without .md extension).",
              },
            },
            required: ["category", "filename"],
          },
          annotations: {
            title: "Delete Context",
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: true,
            openWorldHint: false,
          },
        },
        {
          name: "context_list",
          description:
            "List all knowledge entries in the repository context, optionally filtered by category. Returns filenames, titles, and age for browsing. Use this to understand what knowledge already exists before writing new entries.",
          inputSchema: {
            type: "object" as const,
            properties: {
              category: {
                type: "string",
                enum: VALID_CATEGORIES,
                description: "Optional: filter to a specific category.",
              },
            },
          },
          annotations: {
            title: "List Context",
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
        },
        {
          name: "context_read",
          description:
            "Read the full content of a specific context file. Use after context_search or context_list to get complete details.",
          inputSchema: {
            type: "object" as const,
            properties: {
              category: {
                type: "string",
                description: "The category (facts, decisions, regressions, sessions, changelog)",
              },
              filename: {
                type: "string",
                description: "The filename to read (with or without .md extension)",
              },
            },
            required: ["category", "filename"],
          },
          annotations: {
            title: "Read Context",
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "context_search": {
        const { query, category, limit = 5 } = args as {
          query: string;
          category?: string;
          limit?: number;
        };

        // Validate category if provided
        if (category && !VALID_CATEGORIES.includes(category)) {
          return {
            content: [{
              type: "text" as const,
              text: `Invalid category: ${category}. Valid categories: ${VALID_CATEGORIES.join(", ")}`,
            }],
            isError: true,
          };
        }

        if (!store.exists()) {
          return {
            content: [{
              type: "text" as const,
              text: "No .context/ directory found. Run `repomemory init && repomemory analyze` to set up.",
            }],
          };
        }

        if (!searchIndex) {
          searchIndex = new SearchIndex(store.path, store);
          await searchIndex.rebuild();
        }

        const results = await searchIndex.search(query, category, limit);

        if (results.length === 0) {
          // Fallback to simple text search
          const entries = store.listEntries(category);
          const queryLower = query.toLowerCase();
          const matched = entries
            .filter(
              (e) =>
                e.content.toLowerCase().includes(queryLower) ||
                e.title.toLowerCase().includes(queryLower)
            )
            .slice(0, limit);

          if (matched.length === 0) {
            return {
              content: [{
                type: "text" as const,
                text: `No results found for "${query}"${category ? ` in ${category}` : ""}. Try a different query or browse with context_list.`,
              }],
            };
          }

          const text = matched
            .map(
              (e) =>
                `## ${e.category}/${e.filename}\n**${e.title}**\n\n${e.content.slice(0, 800)}\n`
            )
            .join("\n---\n\n");

          return { content: [{ type: "text" as const, text }] };
        }

        const text = results
          .map(
            (r) =>
              `## ${r.category}/${r.filename} (relevance: ${r.score.toFixed(2)})\n**${r.title}**\n\n${r.snippet}\n`
          )
          .join("\n---\n\n");

        return { content: [{ type: "text" as const, text }] };
      }

      case "context_write": {
        const { category, filename, content, append = false } = args as {
          category: string;
          filename: string;
          content: string;
          append?: boolean;
        };

        // Validate category
        if (!VALID_CATEGORIES.includes(category)) {
          return {
            content: [{
              type: "text" as const,
              text: `Invalid category: ${category}. Valid categories: ${VALID_CATEGORIES.join(", ")}`,
            }],
            isError: true,
          };
        }

        if (!store.exists()) {
          store.scaffold();
        }

        let relativePath: string;
        if (append) {
          relativePath = store.appendEntry(category, filename, content);
        } else {
          relativePath = store.writeEntry(category, filename, content);
        }

        // Incremental index update (not full rebuild)
        if (searchIndex) {
          const entries = store.listEntries(category);
          const entry = entries.find((e) => e.relativePath === relativePath || e.filename === filename + ".md");
          if (entry) {
            await searchIndex.indexEntry(entry);
          }
        }

        return {
          content: [{
            type: "text" as const,
            text: `\u2713 Written to ${relativePath}${append ? " (appended)" : ""}. This knowledge will persist across sessions.`,
          }],
        };
      }

      case "context_delete": {
        const { category, filename } = args as {
          category: string;
          filename: string;
        };

        if (!VALID_CATEGORIES.includes(category)) {
          return {
            content: [{
              type: "text" as const,
              text: `Invalid category: ${category}. Valid categories: ${VALID_CATEGORIES.join(", ")}`,
            }],
            isError: true,
          };
        }

        const fname = filename.endsWith(".md") ? filename : filename + ".md";
        const deleted = store.deleteEntry(category, fname);

        if (!deleted) {
          return {
            content: [{
              type: "text" as const,
              text: `File not found: ${category}/${fname}. Use context_list to see available files.`,
            }],
          };
        }

        // Remove from search index
        if (searchIndex) {
          await searchIndex.removeEntry(category, fname);
        }

        return {
          content: [{
            type: "text" as const,
            text: `\u2713 Deleted ${category}/${fname}. Stale knowledge removed.`,
          }],
        };
      }

      case "context_list": {
        const { category } = (args || {}) as { category?: string };

        if (category && !VALID_CATEGORIES.includes(category)) {
          return {
            content: [{
              type: "text" as const,
              text: `Invalid category: ${category}. Valid categories: ${VALID_CATEGORIES.join(", ")}`,
            }],
            isError: true,
          };
        }

        if (!store.exists()) {
          return {
            content: [{
              type: "text" as const,
              text: "No .context/ directory found. Run `repomemory init` first.",
            }],
          };
        }

        const entries = store.listEntries(category);

        if (entries.length === 0) {
          return {
            content: [{
              type: "text" as const,
              text: `No entries found${category ? ` in ${category}` : ""}. Run \`repomemory analyze\` to populate, or use context_write to add entries.`,
            }],
          };
        }

        const grouped: Record<string, typeof entries> = {};
        for (const entry of entries) {
          if (!grouped[entry.category]) grouped[entry.category] = [];
          grouped[entry.category].push(entry);
        }

        let text = "# Repository Context\n\n";
        for (const [cat, catEntries] of Object.entries(grouped)) {
          text += `## ${cat}/\n`;
          for (const entry of catEntries) {
            const sizeKb = (entry.sizeBytes / 1024).toFixed(1);
            const age = getRelativeTime(entry.lastModified);
            text += `- **${entry.filename}** \u2014 ${entry.title} (${sizeKb}KB, ${age})\n`;
          }
          text += "\n";
        }

        return { content: [{ type: "text" as const, text }] };
      }

      case "context_read": {
        const { category, filename } = args as {
          category: string;
          filename: string;
        };

        const fname = filename.endsWith(".md") ? filename : filename + ".md";
        const content = store.readEntry(category, fname);

        if (!content) {
          return {
            content: [{
              type: "text" as const,
              text: `File not found: ${category}/${fname}. Use context_list to see available files.`,
            }],
          };
        }

        return {
          content: [{
            type: "text" as const,
            text: `# ${category}/${fname}\n\n${content}`,
          }],
        };
      }

      default:
        return {
          content: [{
            type: "text" as const,
            text: `Unknown tool: ${name}`,
          }],
          isError: true,
        };
    }
  });

  // --- Resources ---

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    if (!store.exists()) {
      return { resources: [] };
    }

    const entries = store.listEntries();
    return {
      resources: entries.map((entry) => ({
        uri: `repomemory://${entry.category}/${entry.filename}`,
        name: `${entry.category}/${entry.filename}`,
        description: entry.title,
        mimeType: "text/markdown",
      })),
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    const match = uri.match(/^repomemory:\/\/([^/]+)\/(.+)$/);

    if (!match) {
      throw new Error(`Invalid URI: ${uri}`);
    }

    const [, category, filename] = match;
    const content = store.readEntry(category, filename);

    if (!content) {
      throw new Error(`Resource not found: ${uri}`);
    }

    return {
      contents: [{
        uri,
        mimeType: "text/markdown",
        text: content,
      }],
    };
  });

  // Graceful shutdown
  const cleanup = () => {
    if (searchIndex) {
      searchIndex.close();
      searchIndex = null;
    }
    process.exit(0);
  };

  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function getRelativeTime(date: Date): string {
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
  return `${Math.floor(seconds / 2592000)}mo ago`;
}
