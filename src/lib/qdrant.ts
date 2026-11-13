import crypto from "crypto";

const QDRANT_URL = (process.env.QDRANT_URL || "http://localhost:6333").replace(/\/+$/, "");
const QDRANT_API_KEY = process.env.QDRANT_API_KEY || "";
const COLLECTION_NAME = process.env.QDRANT_COLLECTION || "store_knowledge_base";
const VECTOR_DIM = 768;

export function getQdrantHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (QDRANT_API_KEY) {
    headers["api-key"] = QDRANT_API_KEY;
  }
  return headers;
}

/**
 * Ensures the knowledge base collection exists in Qdrant.
 */
export async function ensureCollection() {
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
      headers: getQdrantHeaders(),
    });
    if (res.status === 404) {
      console.log(`[Qdrant] Creating collection '${COLLECTION_NAME}' (dim: ${VECTOR_DIM}, distance: Cosine)...`);
      const createRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
        method: "PUT",
        headers: getQdrantHeaders(),
        body: JSON.stringify({
          vectors: {
            size: VECTOR_DIM,
            distance: "Cosine",
          },
        }),
      });
      const data = await createRes.json();
      console.log(`[Qdrant] Collection creation status:`, data.status);
    }

    // Ensure keyword index on doc_id exists for filtering and document deletion
    await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/index`, {
      method: "PUT",
      headers: getQdrantHeaders(),
      body: JSON.stringify({
        field_name: "doc_id",
        field_schema: "keyword",
      }),
    });
  } catch (error: any) {
    console.error("[Qdrant] Failed to verify/create collection:", error?.message || error);
  }
}

/**
 * Stores document metadata, text chunks, and vector embeddings in Qdrant.
 * (All document data is stored exclusively in Qdrant; none in PostgreSQL).
 */
export async function upsertChunks(
  docId: string,
  filename: string,
  chunks: Array<{ content: string; chunk_index: number; total_chunks: number }>,
  vectors: number[][],
  fileSize: number = 0,
  mimeType: string = "application/octet-stream"
) {
  await ensureCollection();

  // First delete any previous points for this document in Qdrant
  await deleteDocumentFromQdrant(docId);

  const now = new Date().toISOString();
  const points = chunks.map((chunk, idx) => ({
    id: crypto.randomUUID(),
    vector: vectors[idx],
    payload: {
      doc_id: docId,
      filename,
      chunk_index: chunk.chunk_index,
      total_chunks: chunk.total_chunks,
      content: chunk.content,
      char_count: chunk.content.length,
      file_size: fileSize,
      mime_type: mimeType,
      uploaded_at: now,
    },
  }));

  // Upsert points in batches of 50
  const batchSize = 50;
  for (let i = 0; i < points.length; i += batchSize) {
    const batch = points.slice(i, i + batchSize);
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points?wait=true`, {
      method: "PUT",
      headers: getQdrantHeaders(),
      body: JSON.stringify({ points: batch }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Qdrant vector upsert failed: ${err}`);
    }
  }

  return {
    doc_id: docId,
    filename,
    chunk_count: points.length,
  };
}

/**
 * Searches Qdrant for semantic matches and returns grounded chunks directly from Qdrant payloads.
 */
export async function searchQdrant(
  queryVector: number[],
  limit = 4,
  scoreThreshold = 0.05
) {
  await ensureCollection();

  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/search`, {
    method: "POST",
    headers: getQdrantHeaders(),
    body: JSON.stringify({
      vector: queryVector,
      limit,
      score_threshold: scoreThreshold,
      with_payload: true,
      with_vector: false,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Qdrant search failed: ${err}`);
  }

  const data = await res.json();
  const searchResults: any[] = data.result || [];

  return searchResults
    .filter((item: any) => item.payload?.content)
    .map((item: any) => ({
      id: item.id,
      score: Math.round(item.score * 1000) / 1000,
      doc_id: item.payload?.doc_id || "",
      filename: item.payload?.filename || "",
      chunk_index: item.payload?.chunk_index ?? 0,
      total_chunks: item.payload?.total_chunks ?? 1,
      content: item.payload?.content || "",
    }));
}

/**
 * Deletes all points for a given document from Qdrant.
 */
export async function deleteDocumentFromQdrant(docId: string) {
  await ensureCollection();

  await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/delete?wait=true`, {
    method: "POST",
    headers: getQdrantHeaders(),
    body: JSON.stringify({
      filter: {
        must: [
          {
            key: "doc_id",
            match: {
              value: docId,
            },
          },
        ],
      },
    }),
  });
}

export const deleteDocument = deleteDocumentFromQdrant;

/**
 * Deletes all documents and vector embeddings from Qdrant.
 */
export async function deleteAllDocumentsFromQdrant() {
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
      method: "DELETE",
      headers: getQdrantHeaders(),
    });
    if (!res.ok && res.status !== 404) {
      const err = await res.text();
      console.warn("[Qdrant] Collection deletion returned non-OK:", err);
    }
    // Recreate clean empty collection with proper dimension and index
    await ensureCollection();
    return true;
  } catch (error: any) {
    console.error("[Qdrant] Failed to delete all documents:", error?.message || error);
    throw error;
  }
}

export const deleteAllDocuments = deleteAllDocumentsFromQdrant;

/**
 * Lists unique indexed documents directly from Qdrant points.
 * Excludes chunk content/text payload so that listing documents is lightweight and fast;
 * chunk content is only retrieved on-demand when a user views a specific document.
 */
export async function listIndexedDocuments() {
  await ensureCollection();

  const docMap: { [docId: string]: any } = {};
  let offset: string | number | null = null;

  do {
    const requestBody: any = {
      limit: 1000,
      with_payload: {
        include: ["doc_id", "filename", "file_size", "uploaded_at"],
      },
      with_vector: false,
    };
    if (offset !== null) {
      requestBody.offset = offset;
    }

    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/scroll`, {
      method: "POST",
      headers: getQdrantHeaders(),
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      break;
    }

    const data = await res.json();
    const points = data.result?.points || [];

    for (const point of points) {
      const p = point.payload;
      if (!p?.doc_id) continue;

      if (!docMap[p.doc_id]) {
        docMap[p.doc_id] = {
          id: p.doc_id,
          filename: p.filename,
          chunk_count: 0,
          file_size: p.file_size || 0,
          uploaded_at: p.uploaded_at || new Date().toISOString(),
        };
      }
      docMap[p.doc_id].chunk_count += 1;
    }

    offset = data.result?.next_page_offset ?? null;
  } while (offset !== null);

  return Object.values(docMap).sort(
    (a: any, b: any) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()
  );
}

/**
 * Retrieves chunks (including text content and order) for a specific document directly from Qdrant.
 * Called on-demand when viewing or inspecting a document.
 */
export async function getDocumentChunksFromQdrant(docId: string) {
  await ensureCollection();

  const allPoints: any[] = [];
  let offset: string | number | null = null;

  do {
    const requestBody: any = {
      filter: {
        must: [
          {
            key: "doc_id",
            match: {
              value: docId,
            },
          },
        ],
      },
      limit: 200,
      with_payload: true,
      with_vector: false,
    };
    if (offset !== null) {
      requestBody.offset = offset;
    }

    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/scroll`, {
      method: "POST",
      headers: getQdrantHeaders(),
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) break;

    const data = await res.json();
    const points = data.result?.points || [];
    allPoints.push(...points);

    offset = data.result?.next_page_offset ?? null;
  } while (offset !== null);

  return allPoints
    .map((p: any) => p.payload)
    .sort((a: any, b: any) => (a.chunk_index ?? 0) - (b.chunk_index ?? 0));
}
