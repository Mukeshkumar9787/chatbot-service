import { NextRequest, NextResponse } from "next/server";
import { authenticateSupportUser } from "@/lib/auth";
import { dbTenantStore, dbUserStore } from "@/lib/db";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }> | { id: string };
}

export async function GET(req: NextRequest, context: RouteContext) {
  const authResult = await authenticateSupportUser(req);
  if ("errorResponse" in authResult) {
    return authResult.errorResponse;
  }

  try {
    const params = await context.params;
    const tenant = await dbTenantStore.getTenantByIdOrSlug(params.id);
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found." }, { status: 404 });
    }

    const rawUsers = await dbUserStore.getUsers(tenant.id);
    const users = rawUsers.map((u) => {
      const { password_hash, password, ...safe } = u as any;
      return safe;
    });

    return NextResponse.json({
      success: true,
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
      },
      users,
    });
  } catch (err: any) {
    console.error("[Get Tenant Users Error]:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const authResult = await authenticateSupportUser(req);
  if ("errorResponse" in authResult) {
    return authResult.errorResponse;
  }

  try {
    const params = await context.params;
    const tenant = await dbTenantStore.getTenantByIdOrSlug(params.id);
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found." }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const { userId, newPassword } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required." },
        { status: 400 }
      );
    }

    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
      return NextResponse.json(
        { error: "New password must be at least 6 characters long." },
        { status: 400 }
      );
    }

    const success = await dbUserStore.updatePassword(String(userId), newPassword, tenant.id);
    if (!success) {
      return NextResponse.json(
        { error: "User not found or password could not be updated." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Password updated successfully.",
    });
  } catch (err: any) {
    console.error("[Update Tenant User Password Error]:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
