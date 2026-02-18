# Contributing to repomemory

Thanks for your interest in contributing to repomemory! This guide will help you get set up and understand how the codebase works.

## Getting Started

### Prerequisites

- **Node.js** >= 18.0.0
- **npm** (comes with Node.js)
- **Git**

### Setup

```bash
# Clone the repository
git clone https://github.com/DanielGuru/repomemory.git
cd repomemory

# Install dependencies
npm install

# Build the project
npm run build

# Verify the build works
node dist/index.js --help
```

### Development Workflow

```bash
# Run commands in dev mode (uses tsx to run TypeScript directly)
npm run dev -- init
npm run dev -- analyze --dir /path/to/repo --verbose
npm run dev -- serve --dir /path/to/repo

# Build the project
npm run build

# Run tests
npm test

# Run tests in watch mode
npm run test:watch
```

## Project Structure

```
src/
├── index.ts                  # CLI entry point (Commander.js)
├── commands/
│   ├── init.ts               # Scaffolds .context/ directory
│   ├── analyze.ts            # AI-powered repo analysis (core logic)
│   ├── sync.ts               # Git log -> changelog sync
│   ├── serve.ts              # Starts MCP server
│   └── setup.ts              # Configures editor integrations
├── mcp/
│   └── server.ts             # MCP server with 4 tools + resources
└── lib/
    ├── ai-provider.ts        # Multi-provider AI abstraction
    ├── config.ts              # Configuration loading and defaults
    ├── context-store.ts       # CRUD for .context/ files
    ├── search.ts              # FTS5 full-text search index
    ├── git.ts                 # Git log parsing and diff summaries
    └── repo-scanner.ts        # Repository tree walking and detection
```

## Code Style

- **TypeScript strict mode** -- `strict: true` in `tsconfig.json`. No `any` unless absolutely necessary.
- **ESM modules** -- The project uses `"type": "module"`. All imports **must** use `.js` extensions, even when importing `.ts` files. This is a TypeScript + ESM requirement.
  ```typescript
  // Correct
  import { ContextStore } from "../lib/context-store.js";

  // Wrong -- will fail at runtime
  import { ContextStore } from "../lib/context-store";
  import { ContextStore } from "../lib/context-store.ts";
  ```
- **No default exports** -- Use named exports everywhere.
- **Target** -- ES2022, NodeNext module resolution.

## How to Add a New AI Provider

The AI provider abstraction lives in `src/lib/ai-provider.ts`. Each provider implements the `AIProvider` interface:

```typescript
export interface AIProvider {
  name: string;
  generate(
    messages: AIMessage[],
    options?: { maxTokens?: number; temperature?: number }
  ): Promise<AIResponse>;
}
```

### Steps

1. **Add the provider type** to the `provider` union in `src/lib/config.ts`.

2. **Create a factory function** in `src/lib/ai-provider.ts`:
   ```typescript
   async function createMyProvider(apiKey: string, model?: string): Promise<AIProvider> {
     // Import the SDK dynamically to avoid loading unused dependencies
     const { MySDK } = await import("my-sdk");
     const client = new MySDK({ apiKey });

     return {
       name: "myprovider",
       async generate(messages, options) {
         // Map AIMessage[] to the SDK's format
         // Call the API
         // Return { content, tokensUsed, inputTokens, outputTokens }
       },
     };
   }
   ```

3. **Add a case** in the `createProvider()` switch statement:
   ```typescript
   case "myprovider":
     return createMyProvider(apiKey, config.model);
   ```

4. **Add API key resolution** in `resolveApiKeyForProvider()` to check the appropriate environment variable(s).

5. **Install the SDK** as a dependency:
   ```bash
   npm install my-sdk
   ```

6. **Update documentation** -- Add the provider to the table in `CLAUDE.md` and `README.md`.

### Important Notes

- If the provider's API can time out on large requests (like Anthropic), use streaming.
- Do NOT put provider-specific logic in `analyze.ts`. All provider differences must be handled inside `ai-provider.ts`.
- Wrap SDK errors in `AIError` with appropriate `isRetryable` flag.

## How to Add a New MCP Tool

The MCP server is defined in `src/mcp/server.ts`. Tools are registered via the `ListToolsRequestSchema` handler and executed via the `CallToolRequestSchema` handler.

### Steps

1. **Define the tool** in the `ListToolsRequestSchema` handler's returned array:
   ```typescript
   {
     name: "context_my_tool",
     description: "Description of what the tool does",
     inputSchema: {
       type: "object",
       properties: {
         param1: { type: "string", description: "What this param is for" },
       },
       required: ["param1"],
     },
   }
   ```

2. **Handle the tool call** by adding a case in the `CallToolRequestSchema` handler's switch statement:
   ```typescript
   case "context_my_tool": {
     const param1 = String(args.param1);
     // Implement the tool logic using ContextStore, SearchIndex, etc.
     return {
       content: [{ type: "text", text: "Result" }],
     };
   }
   ```

3. **Write tests** for the new tool's behavior.

### Naming Convention

All MCP tools are prefixed with `context_` to namespace them within the agent's tool list (e.g., `context_search`, `context_write`, `context_list`, `context_read`).

## How to Run Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode during development
npm run test:watch
```

Tests use [Vitest](https://vitest.dev/). Test files should be placed alongside source files or in a `tests/` directory, with the `.test.ts` extension.

## Build Process

The build script at `scripts/build.js` does two things:

1. Runs `tsc` to compile TypeScript to JavaScript in `dist/`.
2. Injects `#!/usr/bin/env node` shebang into `dist/index.js` so the CLI can be run directly.

Plain `tsc` strips shebangs, which is why the custom build script exists.

## Common Pitfalls

- **Forgetting `.js` extensions in imports** -- The build will succeed but the compiled code will fail at runtime with `ERR_MODULE_NOT_FOUND`.
- **Using `create()` instead of `stream()` for Anthropic** -- The Anthropic SDK requires streaming for operations that may take longer than 10 minutes. Always use the streaming API.
- **Modifying `.context/` structure without updating all consumers** -- If you change the directory layout, you must update `context-store.ts`, `search.ts`, AND `server.ts`.
- **Adding heavy dependencies** -- This tool is often run via `npx`, so install size matters. Avoid large dependencies when a lighter alternative exists.

## Submitting Changes

1. Fork the repository and create a feature branch from `main`.
2. Make your changes following the code style guidelines above.
3. Ensure `npm run build` compiles without errors.
4. Ensure `npm test` passes.
5. Open a pull request against `main` with a clear description of what changed and why.

## Questions?

Open an issue on the [GitHub repository](https://github.com/DanielGuru/repomemory/issues) if you have questions or need help getting started.
