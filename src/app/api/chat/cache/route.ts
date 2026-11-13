import { NextRequest, NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/auth";
import {
  getSemanticCacheStats,
  invalidateSemanticCache,
} from "@/lib/semanticCache";

export const dynamic = "force-dynamic";

/**
 * GET /api/chat/cache
 * Inspect semantic cache statistics and health status.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateAdmin(req);
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  try {
    const stats = await getSemanticCacheStats();
    return NextResponse.json({
      success: true,
      stats,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/chat/cache
 * Manually flushes and clears the semantic cache collection.
 */
export async function DELETE(req: NextRequest) {
  const auth = await authenticateAdmin(req);
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  try {
    await invalidateSemanticCache();
    return NextResponse.json({
      success: true,
      message: "Semantic cache collection successfully flushed and cleared.",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

