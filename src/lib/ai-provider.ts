import type { RepoContextConfig } from "./config.js";

export interface AIMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AIResponse {
  content: string;
  tokensUsed?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface AIProvider {
  name: string;
  generate(messages: AIMessage[], options?: { maxTokens?: number; temperature?: number }): Promise<AIResponse>;
}

export class AIError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly statusCode?: number,
    public readonly isRetryable: boolean = false
  ) {
    super(message);
    this.name = "AIError";
  }
}

export async function createProvider(config: RepoContextConfig): Promise<AIProvider> {
  const apiKey = resolveApiKeyForProvider(config);

  switch (config.provider) {
    case "anthropic":
      return createAnthropicProvider(apiKey, config.model);
    case "openai":
      return createOpenAIProvider(apiKey, config.model);
    case "gemini":
      return createGeminiProvider(apiKey, config.model);
    case "grok":
      return createGrokProvider(apiKey, config.model);
    default:
      throw new Error(`Unknown provider: ${config.provider}. Supported: anthropic, openai, gemini, grok`);
  }
}

export async function validateApiKey(config: RepoContextConfig): Promise<boolean> {
  try {
    resolveApiKeyForProvider(config);
    return true;
  } catch {
    return false;
  }
}

function resolveApiKeyForProvider(config: RepoContextConfig): string {
  if (config.apiKey) return config.apiKey;

  const envMap: Record<string, string> = {
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
    gemini: "GEMINI_API_KEY",
    grok: "GROK_API_KEY",
  };

  const altEnvMap: Record<string, string[]> = {
    gemini: ["GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"],
    grok: ["XAI_API_KEY"],
  };

  const envVar = envMap[config.provider];
  if (envVar && process.env[envVar]) {
    return process.env[envVar]!;
  }

  const altVars = altEnvMap[config.provider] || [];
  for (const alt of altVars) {
    if (process.env[alt]) return process.env[alt]!;
  }

  throw new AIError(
    `No API key found for ${config.provider}. Set ${envVar} environment variable or add apiKey to .repomemory.json`,
    config.provider
  );
}

/** Estimate cost for a given provider/model/token count */
export function estimateCost(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number
): string {
  // Approximate pricing per 1M tokens (as of 2025)
  const pricing: Record<string, { input: number; output: number }> = {
    "claude-sonnet-4-6": { input: 3, output: 15 },
    "claude-sonnet-4-5-20250929": { input: 3, output: 15 },
    "claude-opus-4-6": { input: 5, output: 25 },
    "gpt-4o": { input: 2.5, output: 10 },
    "o3-mini": { input: 1.1, output: 4.4 },
    "gemini-2.0-flash": { input: 0.1, output: 0.4 },
    "gemini-2.5-pro": { input: 1.25, output: 10 },
    "grok-3": { input: 3, output: 15 },
    "grok-3-mini": { input: 0.3, output: 0.5 },
  };

  const price = pricing[model];
  if (!price) return "unknown";

  const cost = (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
  if (cost < 0.01) return "<$0.01";
  return `~$${cost.toFixed(2)}`;
}

// --- Anthropic (streaming for large outputs) ---
async function createAnthropicProvider(apiKey: string, model: string): Promise<AIProvider> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });

  return {
    name: "anthropic",
    async generate(messages, options = {}) {
      const { maxTokens = 16000, temperature = 0.3 } = options;

      const systemMsg = messages.find((m) => m.role === "system");
      const conversationMsgs = messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

      try {
        const stream = client.messages.stream({
          model: model || "claude-sonnet-4-6",
          max_tokens: maxTokens,
          temperature,
          system: systemMsg?.content || "",
          messages: conversationMsgs,
        });

        const finalMessage = await stream.finalMessage();

        const content = finalMessage.content
          .filter((block) => block.type === "text")
          .map((block) => ("text" in block ? block.text : ""))
          .join("");

        return {
          content,
          tokensUsed: finalMessage.usage.input_tokens + finalMessage.usage.output_tokens,
          inputTokens: finalMessage.usage.input_tokens,
          outputTokens: finalMessage.usage.output_tokens,
        };
      } catch (err) {
        const e = err as Error & { status?: number };
        throw new AIError(
          e.message,
          "anthropic",
          e.status,
          e.status === 429 || e.status === 529 || e.status === 500
        );
      }
    },
  };
}

// --- OpenAI ---
async function createOpenAIProvider(apiKey: string, model: string): Promise<AIProvider> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });

  return {
    name: "openai",
    async generate(messages, options = {}) {
      const { maxTokens = 16000, temperature = 0.3 } = options;

      try {
        const response = await client.chat.completions.create({
          model: model || "gpt-4o",
          max_completion_tokens: maxTokens,
          temperature,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        });

        const usage = response.usage;
        return {
          content: response.choices[0]?.message?.content || "",
          tokensUsed: usage?.total_tokens,
          inputTokens: usage?.prompt_tokens,
          outputTokens: usage?.completion_tokens,
        };
      } catch (err) {
        const e = err as Error & { status?: number };
        throw new AIError(
          e.message,
          "openai",
          e.status,
          e.status === 429 || e.status === 500
        );
      }
    },
  };
}

// --- Gemini ---
async function createGeminiProvider(apiKey: string, model: string): Promise<AIProvider> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(apiKey);
  const modelName = model || "gemini-2.0-flash";

  return {
    name: "gemini",
    async generate(messages, options = {}) {
      const { temperature = 0.3, maxTokens = 16000 } = options;

      const systemMsg = messages.find((m) => m.role === "system");
      const userMsgs = messages.filter((m) => m.role !== "system");

      // Use systemInstruction properly
      const genModel = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: systemMsg?.content || undefined,
      });

      try {
        const result = await genModel.generateContent({
          contents: userMsgs.map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          })),
          generationConfig: { temperature, maxOutputTokens: maxTokens },
        });

        const response = result.response;
        const usage = response.usageMetadata;
        return {
          content: response.text(),
          tokensUsed: usage?.totalTokenCount,
          inputTokens: usage?.promptTokenCount,
          outputTokens: usage?.candidatesTokenCount,
        };
      } catch (err) {
        const e = err as Error & { status?: number };
        throw new AIError(e.message, "gemini", e.status, true);
      }
    },
  };
}

// --- Grok (xAI) - Uses OpenAI-compatible API ---
async function createGrokProvider(apiKey: string, model: string): Promise<AIProvider> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({
    apiKey,
    baseURL: "https://api.x.ai/v1",
  });

  return {
    name: "grok",
    async generate(messages, options = {}) {
      const { maxTokens = 16000, temperature = 0.3 } = options;

      try {
        const response = await client.chat.completions.create({
          model: model || "grok-3",
          max_tokens: maxTokens,
          temperature,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        });

        const usage = response.usage;
        return {
          content: response.choices[0]?.message?.content || "",
          tokensUsed: usage?.total_tokens,
          inputTokens: usage?.prompt_tokens,
          outputTokens: usage?.completion_tokens,
        };
      } catch (err) {
        const e = err as Error & { status?: number };
        throw new AIError(
          e.message,
          "grok",
          e.status,
          e.status === 429 || e.status === 500
        );
      }
    },
  };
}
