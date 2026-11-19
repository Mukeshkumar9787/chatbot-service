import { NextRequest, NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/auth";
import { parseFileBuffer } from "@/lib/parsers";
import { chunkDocumentText } from "@/lib/chunker";
import { computeEmbeddingsBatch } from "@/lib/embeddings";
import { upsertChunks } from "@/lib/qdrant";
import { invalidateSemanticCache } from "@/lib/semanticCache";
import crypto from "crypto";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ tenantId: string }> | { tenantId: string };
}

/**
 * Handles multipart file uploads strictly in-memory.
 * Files are never saved to disk or an uploads folder; raw bytes are parsed from
 * memory buffers, chunked, converted to vector embeddings, and stored directly in Qdrant.
 */
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const params = await context.params;
    const tenantId = params.tenantId?.trim() || "tenant_smk_default";

    // Authentication check for this tenant
    const auth = await authenticateAdmin(req, tenantId);
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const formData = await req.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
    }

    const uploadedResults = [];
    const errors = [];

    for (const file of files) {
      const filename = file.name;
      const buffer = Buffer.from(await file.arrayBuffer());
      const docId = crypto.createHash("md5").update(`${filename}_${buffer.length}`).digest("hex").slice(0, 12);

      try {
        // 1. Extract text
        const text = await parseFileBuffer(buffer, filename);
        if (!text || !text.trim()) {
          errors.push({ filename, error: "Empty or unreadable document" });
          continue;
        }

        // 2. Chunk text
        const chunks = chunkDocumentText(text);
        if (chunks.length === 0) {
          errors.push({ filename, error: "Could not create chunks" });
          continue;
        }

        // 3. Compute embeddings
        const chunkTexts = chunks.map((c) => c.content);
        const vectors = await computeEmbeddingsBatch(chunkTexts);

        // 4. Save metadata, text chunks, and vector embeddings in tenant's Qdrant collection
        const result = await upsertChunks(
          docId,
          filename,
          chunks,
          vectors,
          buffer.length,
          file.type,
          tenantId
        );
        uploadedResults.push({
          id: docId,
          filename,
          chunk_count: result.chunk_count,
          collection: result.collection,
          tenant_id: tenantId,
          file_size: buffer.length,
          uploaded_at: new Date().toISOString(),
        });
      } catch (err: any) {
        console.error(`[Upload] Failed processing ${filename}:`, err);
        errors.push({ filename, error: err.message });
      }
    }

    if (uploadedResults.length > 0) {
      await invalidateSemanticCache(tenantId).catch((e) =>
        console.warn("[Upload] Semantic cache invalidation failed:", e.message)
      );
    }

    return NextResponse.json({
      success: true,
      uploaded_count: uploadedResults.length,
      documents: uploadedResults,
      errors,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
