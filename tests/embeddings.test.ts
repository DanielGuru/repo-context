import { describe, it, expect } from "vitest";
import { cosineSimilarity, createEmbeddingProvider } from "../src/lib/embeddings.js";

describe("cosineSimilarity", () => {
  it("returns 1.0 for identical vectors", () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 5);
  });

  it("returns 0.0 for orthogonal vectors", () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 5);
  });

  it("returns -1.0 for opposite vectors", () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([-1, 0, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5);
  });

  it("returns 0.0 for zero vectors", () => {
    const a = new Float32Array([0, 0, 0]);
    const b = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it("returns 0.0 for mismatched dimensions", () => {
    const a = new Float32Array([1, 2]);
    const b = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it("computes correct similarity for known vectors", () => {
    // cos(45 degrees) ≈ 0.7071
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([1, 1]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.7071, 3);
  });

  it("handles large dimensions", () => {
    const size = 1536; // OpenAI text-embedding-3-small dimensions
    const a = new Float32Array(size);
    const b = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      a[i] = Math.random();
      b[i] = a[i]; // identical
    }
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 4);
  });
});

describe("createEmbeddingProvider", () => {
  it("returns null when no API keys are available", async () => {
    // Clear any env vars that might be set
    const saved = {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
      GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    };

    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    try {
      const provider = await createEmbeddingProvider({});
      expect(provider).toBeNull();
    } finally {
      // Restore env vars
      for (const [key, val] of Object.entries(saved)) {
        if (val !== undefined) process.env[key] = val;
      }
    }
  });

  it("returns null for explicit provider without key", async () => {
    const saved = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      const provider = await createEmbeddingProvider({ provider: "openai" });
      expect(provider).toBeNull();
    } finally {
      if (saved !== undefined) process.env.OPENAI_API_KEY = saved;
    }
  });
});
