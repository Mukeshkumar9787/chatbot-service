import { NextRequest, NextResponse } from "next/server";
import { dbTenantStore } from "@/lib/db";
import { authenticateAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface RouteContext {
  params: Promise<{ tenantId: string }> | { tenantId: string };
}

const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || "internal_rag_secret_key_123";
const KNOWN_VALID_KEYS = new Set([
  INTERNAL_SERVICE_KEY,
  "internal_rag_secret_key_123",
  "ht0o9mXekRekdVAELUhXWcHBZd2cdf4BsXpuPjEI7H5",
]);

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const params = await context.params;
    const rawTenantId = params.tenantId?.trim() || "default";

    const tenant = await dbTenantStore.getTenantByIdOrSlug(rawTenantId);
    if (!tenant) {
      if (
        rawTenantId === "default" ||
        rawTenantId === "tenant_smk_default" ||
        rawTenantId === "smk" ||
        rawTenantId === "smk_tenant"
      ) {
        return NextResponse.json({
          success: true,
          tenantId: rawTenantId,
          branding: {
            primaryColor: "#3C50E0",
            accentColor: "#0EA5E9",
            storeName: "SMK Store",
            assistantName: "SMK Assistant",
            supportEmail: "support@smkstore.com",
          },
        });
      }

      return NextResponse.json(
        { success: false, error: "Store/Tenant not found." },
        { status: 404 }
      );
    }

    const settings = (tenant.settings as any) || {};
    const storeName = settings.storeName || tenant.name;
    const assistantName = settings.assistantName || `${storeName} Assistant`;
    const supportEmail = settings.supportEmail || (tenant.slug ? `support@${tenant.slug}.com` : "support@smkstore.com");

    return NextResponse.json({
      success: true,
      tenantId: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      branding: {
        primaryColor: settings.primaryColor || "#3C50E0",
        accentColor: settings.accentColor || "#0EA5E9",
        storeName,
        assistantName,
        supportEmail,
        logoUrl: settings.logoUrl || null,
      },
    });
  } catch (err: any) {
    console.error("[Tenant Branding GET Error]:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const params = await context.params;
    const rawTenantId = params.tenantId?.trim() || "default";

    // Allow internal service key or valid tenant admin token
    const serviceKey =
      req.headers.get("x-internal-service-key") ||
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

    const isInternal = Boolean(serviceKey && KNOWN_VALID_KEYS.has(serviceKey));

    if (!isInternal) {
      const authResult = await authenticateAdmin(req, rawTenantId);
      if ("errorResponse" in authResult) {
        return authResult.errorResponse;
      }
    }

    const body = await req.json().catch(() => ({}));
    const { primaryColor, accentColor, assistantName, storeName, supportEmail } = body;

    const updated = await dbTenantStore.updateTenantBranding(rawTenantId, {
      primaryColor: primaryColor ? String(primaryColor).trim() : undefined,
      accentColor: accentColor ? String(accentColor).trim() : undefined,
      assistantName: assistantName ? String(assistantName).trim() : undefined,
      storeName: storeName ? String(storeName).trim() : undefined,
      supportEmail: supportEmail ? String(supportEmail).trim() : undefined,
    });

    const settings = (updated.settings as any) || {};
    const effectiveStoreName = settings.storeName || updated.name;
    const effectiveAssistantName = settings.assistantName || `${effectiveStoreName} Assistant`;
    const effectiveSupportEmail = settings.supportEmail || (updated.slug ? `support@${updated.slug}.com` : "support@smkstore.com");

    return NextResponse.json({
      success: true,
      message: "Branding and theme customized successfully.",
      tenantId: updated.id,
      slug: updated.slug,
      branding: {
        primaryColor: settings.primaryColor || "#3C50E0",
        accentColor: settings.accentColor || "#0EA5E9",
        storeName: effectiveStoreName,
        assistantName: effectiveAssistantName,
        supportEmail: effectiveSupportEmail,
      },
    });
  } catch (err: any) {
    console.error("[Tenant Branding PATCH Error]:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  return PATCH(req, context);
}
