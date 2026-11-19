import { NextRequest, NextResponse } from "next/server";
import { dbTenantStore } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface RouteContext {
  params: Promise<{ tenantId: string }> | { tenantId: string };
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const params = await context.params;
    const rawTenantId = params.tenantId?.trim() || "default";

    const tenant = await dbTenantStore.getTenantByIdOrSlug(rawTenantId);
    if (!tenant) {
      // If default SMK store, consider active
      if (
        rawTenantId === "default" ||
        rawTenantId === "tenant_smk_default" ||
        rawTenantId === "smk" ||
        rawTenantId === "smk_tenant"
      ) {
        return NextResponse.json({
          success: true,
          tenantId: rawTenantId,
          active: true,
          name: "SMK Store",
          slug: "default",
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
        {
          success: false,
          active: false,
          error: "Store/Tenant not found.",
        },
        { status: 404 }
      );
    }

    const isActive = tenant.status === "ACTIVE" && tenant.ai_chatbot_enabled;
    const settings = (tenant.settings as any) || {};
    const storeName = settings.storeName || tenant.name;
    const assistantName = settings.assistantName || `${storeName} Assistant`;
    const supportEmail = settings.supportEmail || (tenant.slug ? `support@${tenant.slug}.com` : "support@smkstore.com");

    return NextResponse.json(
      {
        success: true,
        tenantId: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        active: isActive,
        source: tenant.source,
        planCode: tenant.plan_code,
        branding: {
          primaryColor: settings.primaryColor || "#3C50E0",
          accentColor: settings.accentColor || "#0EA5E9",
          storeName,
          assistantName,
          supportEmail,
          logoUrl: settings.logoUrl || null,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
        },
      }
    );
  } catch (err: any) {
    console.error("[Tenant Status Check Error]:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
