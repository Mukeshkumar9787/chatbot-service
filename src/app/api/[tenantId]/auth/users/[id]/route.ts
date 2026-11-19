import { NextRequest, NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/auth";
import { userStore } from "@/lib/userStore";
import { runWithTenant } from "@/lib/tenantContext";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ tenantId: string; id: string }> | { tenantId: string; id: string };
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const params = await context.params;
  const tenantId = params.tenantId?.trim() || "tenant_smk_default";
  const targetId = params.id;

  const auth = await authenticateAdmin(req, tenantId);
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  return await runWithTenant(tenantId, async () => {
    const targetUser = await userStore.getUserById(targetId, tenantId);
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

    const deleted = await userStore.deleteUser(targetId, tenantId);
    if (!deleted) {
      return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      tenant_id: tenantId,
      message: `User ${targetId} deleted from store ${tenantId}.`,
    });
  });
}
