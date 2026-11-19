import { NextRequest, NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/auth";
import { deleteDocumentFromQdrant, getDocumentChunksFromQdrant } from "@/lib/qdrant";
import { invalidateSemanticCache } from "@/lib/semanticCache";

interface RouteContext {
  params: Promise<{ tenantId: string; id: string }> | { tenantId: string; id: string };
}

export async function GET(req: NextRequest, context: RouteContext) {
  const params = await context.params;
  const tenantId = params.tenantId?.trim() || "tenant_smk_default";
  const docId = params.id;

  const auth = await authenticateAdmin(req, tenantId);
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  try {
    const chunks = await getDocumentChunksFromQdrant(docId, tenantId);
    return NextResponse.json({
      success: true,
      tenant_id: tenantId,
      doc_id: docId,
      chunk_count: chunks.length,
      chunks,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const params = await context.params;
  const tenantId = params.tenantId?.trim() || "tenant_smk_default";
  const docId = params.id;

  const auth = await authenticateAdmin(req, tenantId);
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  try {
    await deleteDocumentFromQdrant(docId, tenantId);
    await invalidateSemanticCache(tenantId).catch((e) =>
      console.warn("[Delete] Semantic cache invalidation failed:", e.message)
    );
    return NextResponse.json({
      success: true,
      tenant_id: tenantId,
      message: `Document ${docId} removed from Qdrant collection '${tenantId}' successfully.`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
