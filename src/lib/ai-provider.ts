import type { RepoContextConfig } from "./config.js";

export interface AIMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AIResponse {
  content: string;
  tokensUsed?: number;
}

export interface AIProvider {
  name: string;
  generate(messages: AIMessage[], options?: { maxTokens?: number; temperature?: number }): Promise<AIResponse>;
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

function resolveApiKeyForProvider(config: RepoContextConfig): string {
  if (config.apiKey) return config.apiKey;

  const envMap: Record<string, string> = {
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
    gemini: "GEMINI_API_KEY",
    grok: "GROK_API_KEY",
  };

  // Also check alternate env var names
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

  throw new Error(
    `No API key found for ${config.provider}. Set ${envVar} environment variable or add apiKey to .repo-context.json`
  );
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

      // Use streaming to handle large outputs (required for >10min responses)
      const stream = client.messages.stream({
        model: model || "claude-sonnet-4-5-20250929",
        max_tokens: maxTokens,
        temperature,
        system: systemMsg?.content || "",
        messages: conversationMsgs,
      });

      // Show progress dots while streaming
      let dotCount = 0;
      stream.on("text", () => {
        dotCount++;
        if (dotCount % 200 === 0) {
          process.stderr.write(".");
        }
      });

      const finalMessage = await stream.finalMessage();
      process.stderr.write("\n");

      const content = finalMessage.content
        .filter((block) => block.type === "text")
        .map((block) => ("text" in block ? block.text : ""))
        .join("");

      return {
        content,
        tokensUsed: finalMessage.usage.input_tokens + finalMessage.usage.output_tokens,
      };
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

      const response = await client.chat.completions.create({
        model: model || "gpt-4o",
        max_tokens: maxTokens,
        temperature,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      });

      return {
        content: response.choices[0]?.message?.content || "",
        tokensUsed: response.usage?.total_tokens,
      };
    },
  };
}

// --- Gemini ---
async function createGeminiProvider(apiKey: string, model: string): Promise<AIProvider> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(apiKey);
  const genModel = genAI.getGenerativeModel({ model: model || "gemini-2.0-flash" });

  return {
    name: "gemini",
    async generate(messages, options = {}) {
      const { temperature = 0.3 } = options;

      // Combine system + user messages for Gemini
      const systemMsg = messages.find((m) => m.role === "system");
      const userMsgs = messages.filter((m) => m.role !== "system");

      const prompt = [
        systemMsg ? `<system>\n${systemMsg.content}\n</system>\n\n` : "",
        ...userMsgs.map((m) => m.content),
      ].join("\n");

      const result = await genModel.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature },
      });

      const response = result.response;
      return {
        content: response.text(),
        tokensUsed: response.usageMetadata?.totalTokenCount,
      };
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

      const response = await client.chat.completions.create({
        model: model || "grok-3",
        max_tokens: maxTokens,
        temperature,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      });

      return {
        content: response.choices[0]?.message?.content || "",
        tokensUsed: response.usage?.total_tokens,
      };
    },
  };
}
