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
 * 2. If GEMINI_API_KEY or GOOGLE_API_KEY is available, use Gemini text-embedding-004 (free, strong on code)
 * 3. If OPENAI_API_KEY is available, use OpenAI text-embedding-3-small
 * 4. Return null (keyword search only)
 *
 * Why Gemini first? text-embedding-004 is free, performs comparably to text-embedding-3-small on
 * technical/code content, and most repomemory users already have a Gemini key (used for analysis).
 * OpenAI is kept as a fallback for users who explicitly want it or don't have a Gemini key.
 * Set `embeddingProvider: "openai"` in .repomemory.json to force OpenAI.
 */
export async function createEmbeddingProvider(
  config: EmbeddingConfig
): Promise<EmbeddingProvider | null> {
  // Explicit provider in config takes priority
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

  // Auto-detect: prefer Gemini (free, strong on technical/code content)
  if (!config.provider) {
    const geminiKey =
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (geminiKey) {
      return createGeminiEmbeddingProvider(geminiKey, config.model);
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      return createOpenAIEmbeddingProvider(openaiKey, config.model);
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

  // Known dimensions per model — updated dynamically on first call for unknown models
  const KNOWN_DIMS: Record<string, number> = {
    "text-embedding-3-small": 1536,
    "text-embedding-3-large": 3072,
    "text-embedding-ada-002": 1536,
  };
  let dims = KNOWN_DIMS[embeddingModel] || 1536;

  return {
    name: "openai",
    get dimensions() { return dims; },
    embed: async (texts: string[]) => {
      const response = await client.embeddings.create({
        model: embeddingModel,
        input: texts,
      });
      const arrays = response.data.map((d) => new Float32Array(d.embedding));
      if (arrays.length > 0 && arrays[0].length !== dims) {
        dims = arrays[0].length;
      }
      return arrays;
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

  let dims = 768; // Default for text-embedding-004

  return {
    name: "gemini",
    get dimensions() { return dims; },
    embed: async (texts: string[]) => {
      // Parallelize in chunks of 5 to avoid rate limits
      const chunkSize = 5;
      const results: Float32Array[] = [];
      for (let i = 0; i < texts.length; i += chunkSize) {
        const chunk = texts.slice(i, i + chunkSize);
        const chunkResults = await Promise.all(
          chunk.map(async (text) => {
            const result = await genModel.embedContent(text);
            return new Float32Array(result.embedding.values);
          })
        );
        results.push(...chunkResults);
      }
      if (results.length > 0 && results[0].length !== dims) {
        dims = results[0].length;
      }
      return results;
    },
  };
}
