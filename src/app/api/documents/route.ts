import { NextRequest, NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/auth";
import { deleteAllDocumentsFromQdrant, listIndexedDocuments } from "@/lib/qdrant";
import { invalidateSemanticCache } from "@/lib/semanticCache";

export async function GET(req: NextRequest) {
  const auth = await authenticateAdmin(req);
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  try {
    const docs = await listIndexedDocuments();
    return NextResponse.json({
      success: true,
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

  try {
    await deleteAllDocumentsFromQdrant();
    await invalidateSemanticCache().catch((e) =>
      console.warn("[DeleteAll] Semantic cache invalidation failed:", e.message)
    );
    return NextResponse.json({
      success: true,
      message: "All documents removed from knowledge base successfully.",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

