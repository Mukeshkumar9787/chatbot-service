import { NextRequest, NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/auth";
import { deleteAllDocumentsFromQdrant, listIndexedDocuments } from "@/lib/qdrant";
import { invalidateSemanticCache } from "@/lib/semanticCache";

interface RouteContext {
  params: Promise<{ tenantId: string }> | { tenantId: string };
}

export async function GET(req: NextRequest, context: RouteContext) {
  const params = await context.params;
  const tenantId = params.tenantId?.trim() || "tenant_smk_default";

  const auth = await authenticateAdmin(req, tenantId);
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

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

export async function DELETE(req: NextRequest, context: RouteContext) {
  const params = await context.params;
  const tenantId = params.tenantId?.trim() || "tenant_smk_default";

  const auth = await authenticateAdmin(req, tenantId);
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

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
