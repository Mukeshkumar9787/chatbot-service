import { NextRequest, NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/auth";
import { deleteDocumentFromQdrant, getDocumentChunksFromQdrant } from "@/lib/qdrant";
import { invalidateSemanticCache } from "@/lib/semanticCache";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateAdmin(req);
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  const { searchParams } = new URL(req.url);
  const tenantId =
    searchParams.get("tenantId") ||
    searchParams.get("tenant") ||
    req.headers.get("x-tenant-id") ||
    req.headers.get("x-tenant-slug") ||
    "tenant_smk_default";

  try {
    const chunks = await getDocumentChunksFromQdrant(params.id, tenantId);
    return NextResponse.json({
      success: true,
      tenant_id: tenantId,
      doc_id: params.id,
      chunk_count: chunks.length,
      chunks,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateAdmin(req);
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  const { searchParams } = new URL(req.url);
  const tenantId =
    searchParams.get("tenantId") ||
    searchParams.get("tenant") ||
    req.headers.get("x-tenant-id") ||
    req.headers.get("x-tenant-slug") ||
    "tenant_smk_default";

  try {
    await deleteDocumentFromQdrant(params.id, tenantId);
    await invalidateSemanticCache(tenantId).catch((e) =>
      console.warn("[Delete] Semantic cache invalidation failed:", e.message)
    );
    return NextResponse.json({
      success: true,
      tenant_id: tenantId,
      message: `Document ${params.id} removed from Qdrant collection '${tenantId}' successfully.`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

