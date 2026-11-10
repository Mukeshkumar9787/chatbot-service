if (typeof File === "undefined") {
  global.File = class File {};
}
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { QdrantClient } = require("@qdrant/js-client-rest");

// 1. Load env
const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      process.env[key] = val;
    }
  }
}

const QDRANT_URL = process.env.QDRANT_URL;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION || "store_knowledge_base";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-2";
const EMBEDDING_DIM = parseInt(process.env.OUTPUT_DIMENSIONALITY || "768", 10);

const qdrant = new QdrantClient({
  url: QDRANT_URL,
  apiKey: QDRANT_API_KEY,
  checkCompatibility: false,
});

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

function splitTextRecursively(text, chunkSize = 500, chunkOverlap = 80) {
  const cleaned = text.replace(/\r\n/g, "\n").trim();
  if (!cleaned) return [];
  if (cleaned.length <= chunkSize) return [cleaned];

  const separators = ["\n\n", "\n", ". ", "? ", "! ", " "];
  const chunks = [];
  let start = 0;

  while (start < cleaned.length) {
    let end = Math.min(start + chunkSize, cleaned.length);

    if (end < cleaned.length) {
      const segment = cleaned.slice(start, end);
      let bestSplit = -1;

      for (const sep of separators) {
        const lastIdx = segment.lastIndexOf(sep);
        if (lastIdx !== -1 && lastIdx > chunkSize / 3) {
          bestSplit = start + lastIdx + sep.length;
          break;
        }
      }

      if (bestSplit !== -1) {
        end = bestSplit;
      }
    }

    const chunk = cleaned.slice(start, end).trim();
    if (chunk) {
      chunks.push(chunk);
    }

    if (end >= cleaned.length) break;
    let nextStart = Math.max(end - chunkOverlap, start + 1);
    while (nextStart < end && cleaned[nextStart - 1] && !/\s/.test(cleaned[nextStart - 1])) {
      nextStart++;
    }
    start = nextStart;
  }

  return chunks;
}

async function computeEmbedding(text) {
  const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
  const res = await model.embedContent({
    content: { role: "user", parts: [{ text }] },
    outputDimensionality: EMBEDDING_DIM,
  });
  return res.embedding.values;
}

async function reindex() {
  console.log(`[Reindex] Connecting to Qdrant at ${QDRANT_URL}...`);
  console.log(`[Reindex] Using model: ${EMBEDDING_MODEL} (outputDimensionality: ${EMBEDDING_DIM})`);

  // Recreate collection to ensure all obsolete/stale chunks and duplicates are removed
  try {
    console.log(`[Reindex] Resetting collection ${QDRANT_COLLECTION} for clean sync...`);
    await qdrant.deleteCollection(QDRANT_COLLECTION);
  } catch (err) {
    // Collection might not exist yet
  }

  console.log(`[Reindex] Creating fresh collection ${QDRANT_COLLECTION}...`);
  await qdrant.createCollection(QDRANT_COLLECTION, {
    vectors: { size: EMBEDDING_DIM, distance: "Cosine" },
  });

  try {
    await qdrant.createPayloadIndex(QDRANT_COLLECTION, {
      field_name: "doc_id",
      field_schema: "keyword",
    });
  } catch (err) {
    console.warn(`[Reindex] Note on payload index creation:`, err?.message || err);
  }

  const docsDir = path.resolve(__dirname, "../../smk/docs");
  const files = fs.readdirSync(docsDir).filter((f) => f.endsWith(".md") && f !== "README.md");

  for (const filename of files) {
    const filePath = path.join(docsDir, filename);
    const content = fs.readFileSync(filePath, "utf8");
    const docId = crypto.createHash("md5").update(`${filename}_${content.length}`).digest("hex").slice(0, 12);

    const rawChunks = splitTextRecursively(content);
    console.log(`\n[Reindex] Processing ${filename} (${rawChunks.length} chunks)...`);

    const points = [];
    for (let i = 0; i < rawChunks.length; i++) {
      const chunkText = rawChunks[i];
      const vector = await computeEmbedding(chunkText);
      const pointId = crypto
        .createHash("md5")
        .update(`${docId}_chunk_${i}`)
        .digest("hex")
        .slice(0, 32);

      const formattedUuid = [
        pointId.slice(0, 8),
        pointId.slice(8, 12),
        pointId.slice(12, 16),
        pointId.slice(16, 20),
        pointId.slice(20, 32),
      ].join("-");

      points.push({
        id: formattedUuid,
        vector,
        payload: {
          doc_id: docId,
          filename,
          chunk_index: i,
          total_chunks: rawChunks.length,
          content: chunkText,
          size_bytes: Buffer.byteLength(content),
          mime_type: "text/markdown",
          indexed_at: new Date().toISOString(),
        },
      });

      process.stdout.write(`.`);
    }

    await qdrant.upsert(QDRANT_COLLECTION, {
      wait: true,
      points,
    });
    console.log(` Upserted ${points.length} vectors for ${filename}!`);
  }

  console.log(`\n[Reindex] All documents successfully indexed into Qdrant using ${EMBEDDING_MODEL} (dim=${EMBEDDING_DIM})!`);
}

reindex().catch((err) => {
  console.error("[Reindex Failed]:", err);
  process.exit(1);
});
