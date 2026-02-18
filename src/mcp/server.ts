import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ContextStore } from "../lib/context-store.js";
import { SearchIndex } from "../lib/search.js";
import { createEmbeddingProvider } from "../lib/embeddings.js";
import type { RepoContextConfig } from "../lib/config.js";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { version: PKG_VERSION } = require("../../package.json");

const VALID_CATEGORIES = ["facts", "decisions", "regressions", "sessions", "changelog", "preferences"];

// --- Session Tracking ---

interface SessionTracker {
  startTime: Date;
  toolCalls: { tool: string; timestamp: Date }[];
  searchQueries: string[];
  entriesRead: string[];
  entriesWritten: string[];
  entriesDeleted: string[];
  writeCallMade: boolean;
  readCallCount: number;
}

function createSessionTracker(): SessionTracker {
  return {
    startTime: new Date(),
    toolCalls: [],
    searchQueries: [],
    entriesRead: [],
    entriesWritten: [],
    entriesDeleted: [],
    writeCallMade: false,
    readCallCount: 0,
  };
}

export function buildSessionSummary(session: SessionTracker, durationSeconds: number): string {
  const date = new Date().toISOString().split("T")[0];
  const mins = Math.round(durationSeconds / 60);
  const parts: string[] = [];

  parts.push(`## Auto-captured session ${date} (${mins}min)\n`);

  if (session.searchQueries.length > 0) {
    parts.push(`**Searched:** ${[...new Set(session.searchQueries)].join(", ")}`);
  }

  if (session.entriesRead.length > 0) {
    parts.push(`**Read:** ${[...new Set(session.entriesRead)].join(", ")}`);
  }

  if (session.entriesWritten.length > 0) {
    parts.push(`**Written:** ${[...new Set(session.entriesWritten)].join(", ")}`);
  }

  if (session.entriesDeleted.length > 0) {
    parts.push(`**Deleted:** ${[...new Set(session.entriesDeleted)].join(", ")}`);
  }

  parts.push(`**Total tool calls:** ${session.toolCalls.length}`);

  return parts.join("\n");
}

// --- Intelligent Category Routing ---

/**
 * Detect the most likely category for a search query using keyword heuristics.
 * Returns undefined if no category can be confidently inferred.
 *
 * Precedence order is intentional: decisions > regressions > preferences > sessions > facts.
 * For ambiguous queries (e.g., "why did the login crash"), decisions wins because
 * understanding the "why" is usually more actionable. The caller retries without
 * category filter if the routed search returns 0 results.
 */
export function detectQueryCategory(query: string): string | undefined {
  const q = query.toLowerCase();

  // Decision-related queries — "why" is the strongest signal
  if (/\b(why\b|chose|decision|alternatives?|trade.?off|instead of|reason\b)/.test(q)) return "decisions";

  // Regression/bug queries
  if (/\b(bug|broke|regression|crash|error\b|fail|fix\b|issues?\b|problem|broken)/.test(q)) return "regressions";

  // Preference/style queries — require coding/style context to avoid false positives
  if (/\b(prefer(?:red|ence|s)?|coding style|naming convention|indent(?:ation)?|lint(?:ing)?|tab(?:s|\s+vs|\s+or)|code format(?:ting)?)/.test(q)) return "preferences";

  // Session queries
  if (/\b(last session|previous session|yesterday|worked on|accomplished)/.test(q)) return "sessions";

  // Architecture/fact queries
  if (/\b(how does|architecture|schema|database|api|endpoint|flow|structure)/.test(q)) return "facts";

  return undefined; // search all categories
}

export async function startMcpServer(
  repoRoot: string,
  config: RepoContextConfig
): Promise<void> {
  const store = new ContextStore(repoRoot, config);
  let searchIndex: SearchIndex | null = null;

  // Initialize embedding provider (optional — falls back to keyword search)
  let embeddingProvider = null;
  try {
    embeddingProvider = await createEmbeddingProvider({
      provider: config.embeddingProvider,
      model: config.embeddingModel,
      apiKey: config.embeddingApiKey,
    });
  } catch {
    // No embeddings available, will use keyword-only search
  }

  if (store.exists()) {
    try {
      searchIndex = new SearchIndex(
        store.path,
        store,
        embeddingProvider,
        config.hybridAlpha
      );
      await searchIndex.rebuild();
    } catch (e) {
      console.error("Warning: Could not initialize search index:", e);
    }
  }

  const session = createSessionTracker();

  const server = new Server(
    {
      name: "repomemory",
      version: PKG_VERSION,
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    }
  );

  // --- Prompts ---

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [
      {
        name: "start-task",
        description: "Search for relevant context before starting a new task. Use this at the beginning of every coding session.",
        arguments: [
          {
            name: "task",
            description: "Brief description of what you're about to work on",
            required: true,
          },
        ],
      },
      {
        name: "end-session",
        description: "Record what you accomplished and discovered during this session. Routes conclusions to the right categories.",
        arguments: [
          {
            name: "summary",
            description: "What you worked on and any discoveries worth remembering",
            required: true,
          },
        ],
      },
    ],
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === "start-task") {
      const task = (args?.task as string) || "general work";
      return {
        description: `Find relevant context for: ${task}`,
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `I'm about to work on: ${task}\n\nYou MUST search the repository's persistent knowledge base for relevant context before starting. Use context_search with relevant keywords, and call context_auto_orient if this is a new session. Do NOT skip this step.`,
            },
          },
        ],
      };
    }

    if (name === "end-session") {
      const summary = (args?.summary as string) || "session work";
      return {
        description: "Record session discoveries",
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `Session summary: ${summary}\n\nPlease record this session's work. IMPORTANT: Route knowledge to the RIGHT categories:\n- New architectural facts \u2192 context_write(category="facts", ...)\n- Decisions made \u2192 context_write(category="decisions", ...)\n- Bugs/regressions found \u2192 context_write(category="regressions", ...)\n- Coding style preferences \u2192 context_write(category="preferences", ...)\n- The session overview itself \u2192 context_write(category="sessions", ...)\n\nDo NOT dump everything into sessions/. Parse your conclusions and write each piece to the appropriate category.`,
            },
          },
        ],
      };
    }

    throw new Error(`Unknown prompt: ${name}`);
  });

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
              detail: {
                type: "string",
                enum: ["compact", "full"],
                description:
                  "Level of detail. 'compact' (default) returns one-line summaries (~50 tokens each). 'full' returns longer snippets.",
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
            "Write a new piece of knowledge to the repository's persistent memory. Use this to record: discoveries you made during this session, architectural decisions, bug patterns, or any insight that would help a future AI session. This persists across sessions \u2014 write anything you'd want a future version of yourself to know.",
          inputSchema: {
            type: "object" as const,
            properties: {
              category: {
                type: "string",
                enum: VALID_CATEGORIES,
                description: `Category for the knowledge:\n- facts: Architecture, patterns, how things work\n- decisions: Why something was chosen (include alternatives considered)\n- regressions: Bug patterns, things that broke, gotchas\n- sessions: What you worked on and discovered this session\n- changelog: Notable changes\n- preferences: Coding style, preferred patterns, tool configs, formatting rules \u2014 personal developer knowledge`,
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
              supersedes: {
                type: "string",
                description:
                  "Filename of an existing entry in the same category that this replaces. The old entry will be auto-deleted.",
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
            "Delete a knowledge entry from the repository context. Use this to remove stale or incorrect information. Knowledge quality matters more than quantity \u2014 prune aggressively.",
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
              compact: {
                type: "boolean",
                description: "If true (default), returns one-line summaries. If false, includes file sizes.",
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
                description: "The category (facts, decisions, regressions, sessions, changelog, preferences)",
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
        {
          name: "context_auto_orient",
          description:
            "Get a comprehensive project orientation in a single call. Returns the project index, recent session summaries, and recently modified entries. Use this at the START of every new coding session to immediately understand the project. This replaces the need to make 3-4 separate tool calls.",
          inputSchema: {
            type: "object" as const,
            properties: {},
          },
          annotations: {
            title: "Auto Orient",
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

    // Track every tool call for session capture
    session.toolCalls.push({ tool: name, timestamp: new Date() });

    // Build write-nudge suffix for non-writing sessions
    const getWriteNudge = (): string => {
      if (!session.writeCallMade && session.readCallCount >= 3) {
        return "\n\n> Tip: Use `context_write` to record any discoveries or decisions from this session.";
      }
      return "";
    };

    switch (name) {
      case "context_search": {
        const { query, category, limit = 5, detail = "compact" } = args as {
          query: string;
          category?: string;
          limit?: number;
          detail?: "compact" | "full";
        };

        session.searchQueries.push(query);
        session.readCallCount++;

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
              text: "No .context/ directory found. Tell the user to run:\n\n  npx repomemory go\n\nThis will set up persistent memory for this project.",
            }],
          };
        }

        if (!searchIndex) {
          searchIndex = new SearchIndex(store.path, store);
          await searchIndex.rebuild();
        }

        // Intelligent category routing: auto-detect if not explicitly provided
        let effectiveCategory = category;
        let routingNote = "";
        if (!category) {
          const detected = detectQueryCategory(query);
          if (detected) {
            effectiveCategory = detected;
            routingNote = `(auto-routed to ${detected}/) `;
          }
        }

        let results = await searchIndex.search(query, effectiveCategory, limit);

        // If routing returned 0 results, retry without category filter
        if (results.length === 0 && effectiveCategory && !category) {
          results = await searchIndex.search(query, undefined, limit);
          routingNote = "";
        }

        if (results.length === 0) {
          // Fallback to simple text search (use explicit category, not auto-routed)
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
                text: `No results found for "${query}"${category ? ` in ${category}` : ""}. Try a different query or browse with context_list.${getWriteNudge()}`,
              }],
            };
          }

          // Format fallback results respecting detail level
          let text: string;
          if (detail === "compact") {
            text = routingNote + matched
              .map((e) => `- **${e.title}** [${e.category}/${e.filename}] \u2014 ${e.content.slice(0, 150).replace(/\n/g, " ")}...`)
              .join("\n");
          } else {
            text = routingNote + matched
              .map((e) => `## ${e.category}/${e.filename}\n**${e.title}**\n\n${e.content.slice(0, 800)}\n`)
              .join("\n---\n\n");
          }

          return { content: [{ type: "text" as const, text: text + getWriteNudge() }] };
        }

        // Format search results based on detail level
        let text: string;
        if (detail === "compact") {
          text = routingNote + results
            .map((r) => `- **${r.title}** [${r.category}/${r.filename}] (score: ${r.score.toFixed(2)}) \u2014 ${r.snippet.slice(0, 150).replace(/\n/g, " ")}...`)
            .join("\n");
        } else {
          text = routingNote + results
            .map((r) => `## ${r.category}/${r.filename} (relevance: ${r.score.toFixed(2)})\n**${r.title}**\n\n${r.snippet}\n`)
            .join("\n---\n\n");
        }

        return { content: [{ type: "text" as const, text: text + getWriteNudge() }] };
      }

      case "context_write": {
        const { category, filename, content, append = false, supersedes } = args as {
          category: string;
          filename: string;
          content: string;
          append?: boolean;
          supersedes?: string;
        };

        session.writeCallMade = true;
        session.entriesWritten.push(`${category}/${filename}`);

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

        // Auto-purge: handle explicit supersedes
        let supersedesDeleted = false;
        if (supersedes) {
          const supersedeFname = supersedes.endsWith(".md") ? supersedes : supersedes + ".md";
          supersedesDeleted = store.deleteEntry(category, supersedeFname);
          if (supersedesDeleted && searchIndex) {
            await searchIndex.removeEntry(category, supersedeFname);
          }
        }

        // Auto-purge: detect potentially overlapping entries
        let supersededList: string[] = [];
        if (!append && searchIndex) {
          try {
            const searchTerms = filename.replace(/-/g, " ");
            const existing = await searchIndex.search(searchTerms, category, 3);
            supersededList = existing
              .filter((r) =>
                r.category === category &&
                r.filename !== filename + ".md" &&
                r.filename !== filename &&
                r.score > 2.0
              )
              .map((d) => `${d.category}/${d.filename} (score: ${d.score.toFixed(1)})`);
          } catch {
            // Best-effort overlap detection
          }
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

        let responseText = `\u2713 Written to ${relativePath}${append ? " (appended)" : ""}.`;

        if (supersedes && supersedesDeleted) {
          responseText += `\n\u2713 Superseded and deleted: ${category}/${supersedes}`;
        } else if (supersedes && !supersedesDeleted) {
          responseText += `\n\u26a0 Could not find ${category}/${supersedes} to supersede (file not found).`;
        }

        if (supersededList.length > 0) {
          responseText += `\n\u26a0 Potentially supersedes: ${supersededList.join(", ")}\n  Consider deleting old entries with context_delete if they're now outdated.`;
        }

        return {
          content: [{
            type: "text" as const,
            text: responseText,
          }],
        };
      }

      case "context_delete": {
        const { category, filename } = args as {
          category: string;
          filename: string;
        };

        session.entriesDeleted.push(`${category}/${filename}`);

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
        const { category, compact = true } = (args || {}) as { category?: string; compact?: boolean };

        session.readCallCount++;

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
              text: "No .context/ directory found. Run `npx repomemory go` to set up.",
            }],
          };
        }

        const entries = store.listEntries(category);

        if (entries.length === 0) {
          return {
            content: [{
              type: "text" as const,
              text: `No entries found${category ? ` in ${category}` : ""}. Run \`npx repomemory analyze\` to populate, or use context_write to add entries.`,
            }],
          };
        }

        const grouped: Record<string, typeof entries> = {};
        for (const entry of entries) {
          if (!grouped[entry.category]) grouped[entry.category] = [];
          grouped[entry.category].push(entry);
        }

        let text = "";
        if (compact) {
          for (const [cat, catEntries] of Object.entries(grouped)) {
            text += `**${cat}/** (${catEntries.length})\n`;
            for (const entry of catEntries) {
              const age = getRelativeTime(entry.lastModified);
              text += `- ${entry.filename} \u2014 ${entry.title} (${age})\n`;
            }
          }
        } else {
          text = "# Repository Context\n\n";
          for (const [cat, catEntries] of Object.entries(grouped)) {
            text += `## ${cat}/\n`;
            for (const entry of catEntries) {
              const sizeKb = (entry.sizeBytes / 1024).toFixed(1);
              const age = getRelativeTime(entry.lastModified);
              text += `- **${entry.filename}** \u2014 ${entry.title} (${sizeKb}KB, ${age})\n`;
            }
            text += "\n";
          }
        }

        return { content: [{ type: "text" as const, text: text.trimEnd() + getWriteNudge() }] };
      }

      case "context_read": {
        const { category, filename } = args as {
          category: string;
          filename: string;
        };

        if (category && !VALID_CATEGORIES.includes(category)) {
          return {
            content: [{
              type: "text" as const,
              text: `Invalid category: ${category}. Valid categories: ${VALID_CATEGORIES.join(", ")}`,
            }],
            isError: true,
          };
        }

        session.entriesRead.push(`${category}/${filename}`);
        session.readCallCount++;

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

      case "context_auto_orient": {
        if (!store.exists()) {
          return {
            content: [{
              type: "text" as const,
              text: "No .context/ directory found. The user needs to run:\n\n  npx repomemory go\n\nThis will set up persistent memory for this project.",
            }],
          };
        }

        const parts: string[] = [];

        // 1. Index.md content
        const indexContent = store.readIndex();
        if (indexContent && indexContent.trim().length > 0) {
          parts.push("# Project Overview\n\n" + indexContent);
        } else {
          parts.push("# Project Overview\n\n*No index.md found. Run `npx repomemory analyze` to generate.*");
        }

        // 2. Developer preferences
        const prefEntries = store.listEntries("preferences");
        if (prefEntries.length > 0) {
          parts.push("\n# Developer Preferences\n");
          for (const p of prefEntries) {
            parts.push(`**${p.title}**\n${p.content.slice(0, 300)}\n`);
          }
        }

        // 3. Recent session summaries (last 3)
        const sessionEntries = store.listEntries("sessions");
        const recentSessions = sessionEntries
          .sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime())
          .slice(0, 3);

        if (recentSessions.length > 0) {
          parts.push("\n# Recent Sessions\n");
          for (const s of recentSessions) {
            const age = getRelativeTime(s.lastModified);
            parts.push(`- **${s.title}** (${age}) \u2014 ${s.content.slice(0, 200).replace(/\n/g, " ")}...`);
          }
        }

        // 4. Recently modified entries (last 7 days, excluding sessions/changelog)
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const allEntries = store.listEntries();
        const recentEntries = allEntries
          .filter(
            (e) =>
              e.category !== "sessions" &&
              e.category !== "changelog" &&
              e.category !== "root" &&
              e.lastModified.getTime() > sevenDaysAgo
          )
          .sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime())
          .slice(0, 10);

        if (recentEntries.length > 0) {
          parts.push("\n# Recently Updated\n");
          for (const e of recentEntries) {
            parts.push(`- ${e.category}/${e.filename}: ${e.title} (${getRelativeTime(e.lastModified)})`);
          }
        }

        // 5. Empty state warning
        const stats = store.getStats();
        if (stats.totalFiles === 0 || (stats.categories["facts"] || 0) === 0) {
          parts.push("\n> **Note**: Context is mostly empty. Ask the user to run `npx repomemory analyze` to populate with architecture knowledge.");
        }

        return { content: [{ type: "text" as const, text: parts.join("\n") }] };
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

    // Validate category to prevent path traversal
    if (!VALID_CATEGORIES.includes(category)) {
      throw new Error(`Invalid category in URI: ${category}`);
    }

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

  // --- Graceful shutdown with auto-session capture ---

  let cleanupDone = false;
  const cleanup = () => {
    if (cleanupDone) return;
    cleanupDone = true;

    // Auto-write session summary if there was meaningful activity
    const duration = Math.round((Date.now() - session.startTime.getTime()) / 1000);
    const hasActivity = session.toolCalls.length > 2;

    if (hasActivity && store.exists()) {
      try {
        const date = new Date().toISOString().split("T")[0];
        const summary = buildSessionSummary(session, duration);
        store.appendEntry("sessions", `auto-${date}`, summary);
      } catch {
        // Best-effort, don't fail shutdown
      }
    }

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

export function getRelativeTime(date: Date): string {
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
  return `${Math.floor(seconds / 2592000)}mo ago`;
}
