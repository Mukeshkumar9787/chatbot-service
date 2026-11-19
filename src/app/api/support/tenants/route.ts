import { NextRequest, NextResponse } from "next/server";
import { authenticateSupportUser } from "@/lib/auth";
import { dbTenantStore, dbUserStore } from "@/lib/db";

export async function GET(req: NextRequest) {
  const authResult = await authenticateSupportUser(req);
  if ("errorResponse" in authResult) {
    return authResult.errorResponse;
  }

  try {
    const tenants = await dbTenantStore.getTenants();
    return NextResponse.json({
      success: true,
      tenants,
    });
  } catch (err: any) {
    console.error("[Get Tenants Error]:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authResult = await authenticateSupportUser(req);
  if ("errorResponse" in authResult) {
    return authResult.errorResponse;
  }

  try {
    const body = await req.json().catch(() => ({}));
    const {
      name,
      slug,
      status = "ACTIVE",
      planCode = "STANDALONE_PRO",
      ownerEmail,
      ownerPassword,
      ownerName,
      settings = {},
    } = body;

    if (!name || !slug) {
      return NextResponse.json(
        { error: "Tenant name and unique slug are required." },
        { status: 400 }
      );
    }

    const cleanSlug = String(slug)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "");

    if (!cleanSlug) {
      return NextResponse.json(
        { error: "Invalid slug format. Use alphanumeric characters and dashes." },
        { status: 400 }
      );
    }

    // Check existing
    const existing = await dbTenantStore.getTenantByIdOrSlug(cleanSlug);
    if (existing) {
      return NextResponse.json(
        { error: `A tenant with slug '${cleanSlug}' already exists.` },
        { status: 409 }
      );
    }

    const tenantId = `tenant_${cleanSlug}_${Date.now().toString(36)}`;
    const tenant = await dbTenantStore.createTenant({
      id: tenantId,
      name: String(name).trim(),
      slug: cleanSlug,
      status: status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
      source: "STANDALONE",
      planCode: String(planCode || "STANDALONE_PRO"),
      aiChatbotEnabled: status !== "INACTIVE",
      settings: {
        storeName: String(name).trim(),
        ...settings,
      },
    });

    // If an initial owner account is provided, create it in users table scoped to this tenant
    let adminUser = null;
    if (ownerEmail && ownerPassword) {
      adminUser = await dbUserStore.createOrUpdateUser({
        email: String(ownerEmail).trim().toLowerCase(),
        name: String(ownerName || name || "Store Admin").trim(),
        role: "SUPPORT_ADMIN",
        is_active: true,
        password: String(ownerPassword),
        tenantId: tenant.id,
      });
    }

    return NextResponse.json({
      success: true,
      tenant,
      adminUser: adminUser ? { id: adminUser.id, email: adminUser.email } : null,
    });
  } catch (err: any) {
    console.error("[Create Tenant Error]:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
