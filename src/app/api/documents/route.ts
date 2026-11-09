import { NextRequest, NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/auth";
import { listIndexedDocuments } from "@/lib/qdrant";

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

