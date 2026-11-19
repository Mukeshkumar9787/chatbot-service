import { NextRequest, NextResponse } from "next/server";
import { authenticateUser, comparePassword } from "@/lib/auth";
import { userStore } from "@/lib/userStore";
import { runWithTenant } from "@/lib/tenantContext";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ tenantId: string }> | { tenantId: string };
}

export async function POST(req: NextRequest, context: RouteContext) {
  const params = await context.params;
  const tenantId = params.tenantId?.trim() || "tenant_smk_default";

  const auth = await authenticateUser(req, tenantId);
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  try {
    return await runWithTenant(tenantId, async () => {
      const body = await req.json();
      delete body.tenantId;
      delete body.tenant_id;
      delete body.tenantSlug;
      delete body.tenant;

      const { currentPassword, newPassword, confirmPassword, targetUserId } = body;

      if (!newPassword || typeof newPassword !== "string") {
        return NextResponse.json({ error: "New password is required" }, { status: 400 });
      }

      if (newPassword.length < 6) {
        return NextResponse.json(
          { error: "New password must be at least 6 characters long" },
          { status: 400 }
        );
      }

      if (newPassword !== confirmPassword) {
        return NextResponse.json(
          { error: "New password and confirmation do not match" },
          { status: 400 }
        );
      }

      // Determine target user (self or team member if admin)
      const isResettingOther = targetUserId && String(targetUserId) !== String(auth.user.id);

      if (isResettingOther) {
        if (auth.user.role !== "SUPPORT_ADMIN") {
          return NextResponse.json(
            { error: "Only administrators can reset other users' passwords" },
            { status: 403 }
          );
        }

        const targetUser = await userStore.getUserById(String(targetUserId), tenantId);
        if (!targetUser) {
          return NextResponse.json({ error: "Target user not found" }, { status: 404 });
        }

        const updated = await userStore.updatePassword(targetUser.id, newPassword, tenantId);
        if (!updated) {
          return NextResponse.json({ error: "Failed to update password" }, { status: 500 });
        }

        return NextResponse.json({
          success: true,
          tenant_id: tenantId,
          message: `Password reset successfully for ${targetUser.email}`,
        });
      }

      // Resetting own password
      const currentUserRecord = await userStore.getUserById(auth.user.id, tenantId);
      if (!currentUserRecord) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      // If user has an existing password_hash, verify current password
      if (currentUserRecord.password_hash) {
        if (!currentPassword) {
          return NextResponse.json(
            { error: "Current password is required to set a new password" },
            { status: 400 }
          );
        }

        if (!comparePassword(currentPassword, currentUserRecord.password_hash)) {
          return NextResponse.json(
            { error: "Current password is incorrect" },
            { status: 401 }
          );
        }
      }

      const updated = await userStore.updatePassword(auth.user.id, newPassword, tenantId);
      if (!updated) {
        return NextResponse.json({ error: "Failed to update password" }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        tenant_id: tenantId,
        message: "Your password has been changed successfully.",
      });
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
