import { NextRequest, NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/auth";
import { userStore } from "@/lib/userStore";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateAdmin(req);
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  const deleted = await userStore.deleteUser(params.id);
  if (!deleted) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    message: `User ${params.id} deleted.`,
  });
}

