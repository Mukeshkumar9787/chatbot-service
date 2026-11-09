import crypto from "crypto";
import { GoogleGenerativeAI } from "@google/generative-ai";

const EMBEDDING_DIM = 768;
const API_KEY = process.env.GEMINI_API_KEY || "";
const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || "text-embedding-004";

let genAI: GoogleGenerativeAI | null = null;
if (API_KEY && !API_KEY.startsWith("your-") && API_KEY !== "mock-key") {
  genAI = new GoogleGenerativeAI(API_KEY);
}

/**
 * Deterministic fallback embedding generator for testing and offline modes.
 */
function getLocalFallbackEmbedding(text: string = ""): number[] {
  const vector = new Array(EMBEDDING_DIM).fill(0);
  const words = text.toLowerCase().match(/\w+/g) || [];

  if (words.length === 0) return vector;

  for (const word of words) {
    const hash = crypto.createHash("sha256").update(word).digest();
    const idx = hash.readUInt16BE(0) % EMBEDDING_DIM;
    const weight = (hash.readUInt16BE(2) % 100) / 100 + 0.5;
    vector[idx] += weight;
  }

  // L2 normalize
  const norm = Math.sqrt(vector.reduce((acc, v) => acc + v * v, 0));
  if (norm > 0) {
    return vector.map((v) => v / norm);
  }
  return vector;
}

/**
 * Generates dense 768-dim vector embedding using Google Gemini or local fallback.
 */
export async function computeEmbedding(text: string): Promise<number[]> {
  if (!text || !text.trim()) {
    return new Array(EMBEDDING_DIM).fill(0);
  }

  if (genAI) {
    try {
      const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
      const result = await model.embedContent(text);
      if (result.embedding?.values && result.embedding.values.length > 0) {
        return result.embedding.values;
      }
    } catch (err: any) {
      console.warn("[Embeddings] Gemini embedding API warning:", err.message, "Using local fallback.");
    }
  }

  return getLocalFallbackEmbedding(text);
}

/**
 * Batch computes embeddings for an array of text chunks.
 */
export async function computeEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];
  for (const text of texts) {
    const vec = await computeEmbedding(text);
    results.push(vec);
  }
  return results;
}
