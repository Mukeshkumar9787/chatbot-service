import { NextRequest, NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/auth";
import { deleteAllDocumentsFromQdrant, listIndexedDocuments } from "@/lib/qdrant";
import { invalidateSemanticCache } from "@/lib/semanticCache";

export async function GET(req: NextRequest) {
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
    const docs = await listIndexedDocuments(tenantId);
    return NextResponse.json({
      success: true,
      tenant_id: tenantId,
      count: docs.length,
      documents: docs,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
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
    await deleteAllDocumentsFromQdrant(tenantId);
    await invalidateSemanticCache(tenantId).catch((e) =>
      console.warn("[DeleteAll] Semantic cache invalidation failed:", e.message)
    );
    return NextResponse.json({
      success: true,
      tenant_id: tenantId,
      message: `All documents removed from knowledge base '${tenantId}' successfully.`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

