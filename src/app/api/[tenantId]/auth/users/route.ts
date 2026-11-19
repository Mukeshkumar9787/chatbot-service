import { NextRequest, NextResponse } from "next/server";
import { authenticateAdmin } from "@/lib/auth";
import { userStore } from "@/lib/userStore";
import { runWithTenant } from "@/lib/tenantContext";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ tenantId: string }> | { tenantId: string };
}

export async function GET(req: NextRequest, context: RouteContext) {
  const params = await context.params;
  const tenantId = params.tenantId?.trim() || "tenant_smk_default";

  const auth = await authenticateAdmin(req, tenantId);
  if ("errorResponse" in auth) {
    return auth.errorResponse;
  }

  return await runWithTenant(tenantId, async () => {
    const rawUsers = await userStore.getUsers(tenantId);
    const users = rawUsers.map((u) => {
      const { password_hash, password, ...safe } = u as any;
      return safe;
    });

    return NextResponse.json({
      success: true,
      tenant_id: tenantId,
      users,
      currentUser: {
        id: auth.user.id,
        email: auth.user.email,
        name: auth.user.name,
        role: auth.user.role,
        tenant_id: tenantId,
      },
    });
  });
}

export async function POST(req: NextRequest, context: RouteContext) {
  const params = await context.params;
  const tenantId = params.tenantId?.trim() || "tenant_smk_default";

  const auth = await authenticateAdmin(req, tenantId);
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

      const { email, name, role = "SUPPORT_ADMIN", password } = body;

      if (!email || !password) {
        return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
      }

      const existing = await userStore.getUserByEmail(email, tenantId);
      if (existing) {
        return NextResponse.json({ error: "User already exists with this email for this store" }, { status: 400 });
      }

      const newUser = await userStore.createOrUpdateUser({
        email,
        name: name || email,
        role: role as any,
        is_active: true,
        password,
        tenantId,
      });

      return NextResponse.json({
        success: true,
        tenant_id: tenantId,
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          role: newUser.role,
          tenant_id: tenantId,
        },
      });
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
