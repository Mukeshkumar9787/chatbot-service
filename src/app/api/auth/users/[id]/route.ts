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

  const targetUser = await userStore.getUserById(params.id);
  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Prevent self-deletion
  if (
    targetUser.id === auth.user.id ||
    targetUser.email.toLowerCase() === auth.user.email.toLowerCase()
  ) {
    return NextResponse.json(
      { error: "You cannot delete your own administrator account." },
      { status: 400 }
    );
  }

  const deleted = await userStore.deleteUser(params.id);
  if (!deleted) {
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: `User ${params.id} deleted.`,
  });
}

