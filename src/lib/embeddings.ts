export interface EmbeddingProvider {
  name: string;
  dimensions: number;
  embed(texts: string[]): Promise<Float32Array[]>;
}

export interface EmbeddingConfig {
  provider?: "openai" | "gemini";
  model?: string;
  apiKey?: string;
}

/**
 * Compute cosine similarity between two vectors.
 * Returns a value between -1 and 1 (1 = identical, 0 = orthogonal).
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  if (a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  const result = dotProduct / denominator;
  return Number.isFinite(result) ? result : 0;
}

/**
 * Create an embedding provider based on available API keys.
 * Returns null if no embedding provider is available (graceful fallback to FTS5-only).
 *
 * Resolution order:
 * 1. If config.provider is explicitly set, use that
 * 2. If OPENAI_API_KEY is available, use OpenAI text-embedding-3-small
 * 3. If GEMINI_API_KEY or GOOGLE_API_KEY is available, use Gemini text-embedding-004
 * 4. Return null (keyword search only)
 */
export async function createEmbeddingProvider(
  config: EmbeddingConfig
): Promise<EmbeddingProvider | null> {
  // Explicit provider in config
  if (config.provider === "openai") {
    const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    if (apiKey) {
      return createOpenAIEmbeddingProvider(apiKey, config.model);
    }
  }

  if (config.provider === "gemini") {
    const apiKey =
      config.apiKey ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (apiKey) {
      return createGeminiEmbeddingProvider(apiKey, config.model);
    }
  }

  // Auto-detect: prefer OpenAI (cheaper, higher quality)
  if (!config.provider) {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      return createOpenAIEmbeddingProvider(openaiKey, config.model);
    }

    const geminiKey =
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (geminiKey) {
      return createGeminiEmbeddingProvider(geminiKey, config.model);
    }
  }

  return null;
}

async function createOpenAIEmbeddingProvider(
  apiKey: string,
  model?: string
): Promise<EmbeddingProvider> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });
  const embeddingModel = model || "text-embedding-3-small";

  return {
    name: "openai",
    dimensions: 1536,
    embed: async (texts: string[]) => {
      const response = await client.embeddings.create({
        model: embeddingModel,
        input: texts,
      });
      return response.data.map((d) => new Float32Array(d.embedding));
    },
  };
}

async function createGeminiEmbeddingProvider(
  apiKey: string,
  model?: string
): Promise<EmbeddingProvider> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(apiKey);
  const embeddingModel = model || "text-embedding-004";
  const genModel = genAI.getGenerativeModel({ model: embeddingModel });

  return {
    name: "gemini",
    dimensions: 768,
    embed: async (texts: string[]) => {
      const results: Float32Array[] = [];
      for (const text of texts) {
        const result = await genModel.embedContent(text);
        results.push(new Float32Array(result.embedding.values));
      }
      return results;
    },
  };
}
