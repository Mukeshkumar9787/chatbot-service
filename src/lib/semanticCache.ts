import crypto from "crypto";
import { getQdrantHeaders } from "./qdrant";

const QDRANT_URL = (process.env.QDRANT_URL || "http://localhost:6333").replace(/\/+$/, "");
export const SEMANTIC_CACHE_COLLECTION =
  process.env.QDRANT_CACHE_COLLECTION || "chatbot_semantic_cache";
export const DEFAULT_SIMILARITY_THRESHOLD = parseFloat(
  process.env.SEMANTIC_CACHE_THRESHOLD || "0.90"
);
export const DEFAULT_CACHE_TTL_SECONDS = parseInt(
  process.env.SEMANTIC_CACHE_TTL || "604800",
  10
); // 7 days
export const SEMANTIC_CACHE_ENABLED =
  process.env.SEMANTIC_CACHE_ENABLED === undefined ||
  process.env.SEMANTIC_CACHE_ENABLED === "" ||
  process.env.SEMANTIC_CACHE_ENABLED.toLowerCase() !== "false";
const VECTOR_DIM = 768;

export interface CachedItem {
  id: string;
  vector?: number[];
  query: string;
  answer: string;
  sources: Array<{
    document: string;
    chunk_index?: number;
    snippet: string;
    relevance_score?: number;
  }>;
  created_at: string;
  last_hit_at: string;
  hit_count: number;
  ttl_seconds: number;
}

export interface CacheMatchResult {
  hit: boolean;
  id?: string;
  query?: string;
  answer?: string;
  sources?: any[];
  score?: number;
  hit_count?: number;
  created_at?: string;
}

/**
 * In-memory fallback and fast local cache.
 * Acts as high-speed Tier-1 cache and fallback when Qdrant is in offline/test mode.
 */
const inMemoryCache = new Map<string, CachedItem>();

/**
 * Calculates cosine similarity between two normalized or raw dense vectors.
 */
export function computeCosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

let collectionEnsured = false;

/**
 * Ensures the dedicated semantic cache collection exists in Qdrant.
 */
export async function ensureSemanticCacheCollection(): Promise<boolean> {
  if (collectionEnsured) return true;

  try {
    const res = await fetch(
      `${QDRANT_URL}/collections/${SEMANTIC_CACHE_COLLECTION}`,
      {
        headers: getQdrantHeaders(),
      }
    );

    if (res.status === 404) {
      console.log(
        `[SemanticCache] Creating collection '${SEMANTIC_CACHE_COLLECTION}' (dim: ${VECTOR_DIM}, metric: Cosine)...`
      );
      const createRes = await fetch(
        `${QDRANT_URL}/collections/${SEMANTIC_CACHE_COLLECTION}`,
        {
          method: "PUT",
          headers: getQdrantHeaders(),
          body: JSON.stringify({
            vectors: {
              size: VECTOR_DIM,
              distance: "Cosine",
            },
          }),
        }
      );
      const data = await createRes.json();
      console.log(`[SemanticCache] Collection creation result:`, data.status);
    }

    collectionEnsured = true;
    return true;
  } catch (err: any) {
    // If Qdrant is unreachable, in-memory cache serves requests
    return false;
  }
}

/**
 * Checks semantic cache for a prior question with cosine similarity >= threshold.
 * Returns the cached answer, sources, and similarity score if matched.
 */
export async function findSemanticCacheMatch(
  queryVector: number[],
  threshold = DEFAULT_SIMILARITY_THRESHOLD
): Promise<CacheMatchResult | null> {
  if (!SEMANTIC_CACHE_ENABLED || !queryVector || queryVector.length === 0) {
    return null;
  }

  // 1. First, search Qdrant if collection is accessible
  try {
    await ensureSemanticCacheCollection();

    const res = await fetch(
      `${QDRANT_URL}/collections/${SEMANTIC_CACHE_COLLECTION}/points/search`,
      {
        method: "POST",
        headers: getQdrantHeaders(),
        body: JSON.stringify({
          vector: queryVector,
          limit: 1,
          score_threshold: threshold,
          with_payload: true,
          with_vector: false,
        }),
      }
    );

    if (res.ok) {
      const data = await res.json();
      const points = data.result || [];

      if (points.length > 0) {
        const topMatch = points[0];
        const payload = topMatch.payload;
        const score = Math.round(topMatch.score * 1000) / 1000;

        // Check TTL expiration if set
        if (payload?.created_at && payload?.ttl_seconds) {
          const ageSeconds =
            (Date.now() - new Date(payload.created_at).getTime()) / 1000;
          if (ageSeconds > payload.ttl_seconds) {
            // Expired cache point
            return null;
          }
        }

        if (payload?.answer) {
          return {
            hit: true,
            id: topMatch.id,
            query: payload.query,
            answer: payload.answer,
            sources: payload.sources || [],
            score,
            hit_count: (payload.hit_count || 1) + 1,
            created_at: payload.created_at,
          };
        }
      }
    }
  } catch (err: any) {
    // Fall back to in-memory check
  }

  // 2. In-Memory fallback search (for local testing, offline modes, or instant hits)
  let bestScore = -1;
  let bestItem: CachedItem | null = null;
  const now = Date.now();

  const items = Array.from(inMemoryCache.values());
  for (const item of items) {
    if (item.ttl_seconds && item.created_at) {
      const ageSeconds = (now - new Date(item.created_at).getTime()) / 1000;
      if (ageSeconds > item.ttl_seconds) {
        inMemoryCache.delete(item.id);
        continue;
      }
    }

    if (item.vector) {
      const sim = computeCosineSimilarity(queryVector, item.vector);
      if (sim > bestScore) {
        bestScore = sim;
        bestItem = item;
      }
    }
  }

  if (bestItem && bestScore >= threshold) {
    bestItem.hit_count += 1;
    bestItem.last_hit_at = new Date().toISOString();
    return {
      hit: true,
      id: bestItem.id,
      query: bestItem.query,
      answer: bestItem.answer,
      sources: bestItem.sources || [],
      score: Math.round(bestScore * 1000) / 1000,
      hit_count: bestItem.hit_count,
      created_at: bestItem.created_at,
    };
  }

  return null;
}

/**
 * Saves a generated answer into the semantic cache for future similar queries.
 */
export async function storeInSemanticCache(
  queryVector: number[],
  query: string,
  answer: string,
  sources: any[] = [],
  ttlSeconds = DEFAULT_CACHE_TTL_SECONDS
): Promise<string> {
  if (!SEMANTIC_CACHE_ENABLED || !queryVector || !answer || !answer.trim()) {
    return "";
  }

  // Skip caching refusal/error responses
  const lowerAnswer = answer.toLowerCase();
  if (
    lowerAnswer.includes("i cannot process this request") ||
    lowerAnswer.includes("i could not find specific information") ||
    lowerAnswer.includes("error occurred")
  ) {
    return "";
  }

  const pointId = crypto.randomUUID();
  const now = new Date().toISOString();

  const payload = {
    query,
    answer,
    sources,
    created_at: now,
    last_hit_at: now,
    hit_count: 1,
    ttl_seconds: ttlSeconds,
  };

  // 1. Store in memory fallback
  inMemoryCache.set(pointId, {
    id: pointId,
    vector: [...queryVector],
    query,
    answer,
    sources,
    created_at: now,
    last_hit_at: now,
    hit_count: 1,
    ttl_seconds: ttlSeconds,
  });

  // 2. Persist to Qdrant collection
  try {
    await ensureSemanticCacheCollection();

    await fetch(
      `${QDRANT_URL}/collections/${SEMANTIC_CACHE_COLLECTION}/points?wait=true`,
      {
        method: "PUT",
        headers: getQdrantHeaders(),
        body: JSON.stringify({
          points: [
            {
              id: pointId,
              vector: queryVector,
              payload,
            },
          ],
        }),
      }
    );
  } catch (err: any) {
    // Graceful fallback to in-memory
  }

  return pointId;
}

/**
 * Increments the hit count and updates last_hit_at for an existing cached point.
 */
export async function recordCacheHit(id: string, currentHitCount: number = 1): Promise<void> {
  const now = new Date().toISOString();

  // Update in-memory
  const memItem = inMemoryCache.get(id);
  if (memItem) {
    memItem.hit_count = currentHitCount;
    memItem.last_hit_at = now;
  }

  // Update Qdrant payload
  try {
    await fetch(
      `${QDRANT_URL}/collections/${SEMANTIC_CACHE_COLLECTION}/points/payload`,
      {
        method: "POST",
        headers: getQdrantHeaders(),
        body: JSON.stringify({
          points: [id],
          payload: {
            hit_count: currentHitCount,
            last_hit_at: now,
          },
        }),
      }
    );
  } catch (err) {}
}

/**
 * Invalidates and purges the entire semantic cache.
 * Called when knowledge base documents are uploaded, modified, or deleted.
 */
export async function invalidateSemanticCache(): Promise<void> {
  inMemoryCache.clear();
  collectionEnsured = false;

  try {
    await fetch(`${QDRANT_URL}/collections/${SEMANTIC_CACHE_COLLECTION}`, {
      method: "DELETE",
      headers: getQdrantHeaders(),
    });
    console.log(`[SemanticCache] Successfully invalidated collection '${SEMANTIC_CACHE_COLLECTION}'.`);
  } catch (err: any) {
    console.warn(`[SemanticCache] Failed to delete cache collection:`, err?.message || err);
  }

  // Recreate clean collection
  await ensureSemanticCacheCollection();
}

/**
 * Retrieves statistics about the semantic cache.
 */
export async function getSemanticCacheStats() {
  let qdrantPointCount = 0;
  let qdrantStatus = "unknown";

  try {
    const res = await fetch(
      `${QDRANT_URL}/collections/${SEMANTIC_CACHE_COLLECTION}`,
      {
        headers: getQdrantHeaders(),
      }
    );
    if (res.ok) {
      const data = await res.json();
      qdrantPointCount = data.result?.points_count || 0;
      qdrantStatus = data.result?.status || "green";
    }
  } catch (err) {
    qdrantStatus = "offline";
  }

  return {
    enabled: SEMANTIC_CACHE_ENABLED,
    collection: SEMANTIC_CACHE_COLLECTION,
    similarity_threshold: DEFAULT_SIMILARITY_THRESHOLD,
    ttl_seconds: DEFAULT_CACHE_TTL_SECONDS,
    in_memory_items: inMemoryCache.size,
    qdrant_items: qdrantPointCount,
    qdrant_status: qdrantStatus,
  };
}

/**
 * Resets in-memory cache (primarily for unit tests).
 */
export function resetInMemoryCache() {
  inMemoryCache.clear();
}
