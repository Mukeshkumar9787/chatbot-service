import { NextRequest, NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/auth";
import {
  getSemanticCacheStats,
  invalidateSemanticCache,
} from "@/lib/semanticCache";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ tenantId: string }> | { tenantId: string };
}

/**
 * GET /api/:tenantId/chat/cache
 * Inspect semantic cache statistics and health status for this tenant.
 */
export async function GET(req: NextRequest, context: RouteContext) {
  const params = await context.params;
  const tenantId = params.tenantId?.trim() || "tenant_smk_default";

  const auth = await authenticateAdmin(req, tenantId);
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  try {
    const stats = await getSemanticCacheStats();
    return NextResponse.json({
      success: true,
      tenant_id: tenantId,
      stats,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/:tenantId/chat/cache
 * Manually flushes and clears the semantic cache collection for this tenant.
 */
export async function DELETE(req: NextRequest, context: RouteContext) {
  const params = await context.params;
  const tenantId = params.tenantId?.trim() || "tenant_smk_default";

  const auth = await authenticateAdmin(req, tenantId);
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  try {
    await invalidateSemanticCache(tenantId);
    return NextResponse.json({
      success: true,
      tenant_id: tenantId,
      message: `Semantic cache for tenant '${tenantId}' successfully flushed and cleared.`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
