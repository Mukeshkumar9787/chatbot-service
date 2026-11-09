import { NextRequest, NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/auth";
import { deleteDocumentFromQdrant, getDocumentChunksFromQdrant } from "@/lib/qdrant";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateAdmin(req);
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  try {
    const chunks = await getDocumentChunksFromQdrant(params.id);
    return NextResponse.json({
      success: true,
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

  try {
    await deleteDocumentFromQdrant(params.id);
    return NextResponse.json({
      success: true,
      message: `Document ${params.id} removed from Qdrant successfully.`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

