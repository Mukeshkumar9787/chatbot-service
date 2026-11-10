import { NextRequest, NextResponse } from "next/server";
import { authenticateUser, comparePassword } from "@/lib/auth";
import { userStore } from "@/lib/userStore";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser(req);
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  try {
    const { currentPassword, newPassword, confirmPassword, targetUserId } = await req.json();

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

      const targetUser = await userStore.getUserById(String(targetUserId));
      if (!targetUser) {
        return NextResponse.json({ error: "Target user not found" }, { status: 404 });
      }

      const updated = await userStore.updatePassword(targetUser.id, newPassword);
      if (!updated) {
        return NextResponse.json({ error: "Failed to update password" }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: `Password reset successfully for ${targetUser.email}`,
      });
    }

    // Resetting own password
    const currentUserRecord = await userStore.getUserById(auth.user.id);
    if (!currentUserRecord) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // If user has an existing password_hash, verify current password
    if (currentUserRecord.password_hash) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: "Current password is required" },
          { status: 400 }
        );
      }

      if (!comparePassword(currentPassword, currentUserRecord.password_hash)) {
        return NextResponse.json(
          { error: "Current password is incorrect" },
          { status: 400 }
        );
      }

      if (currentPassword === newPassword) {
        return NextResponse.json(
          { error: "New password must be different from current password" },
          { status: 400 }
        );
      }
    }

    const updated = await userStore.updatePassword(auth.user.id, newPassword);
    if (!updated) {
      return NextResponse.json({ error: "Failed to update password" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Your password has been updated successfully",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

