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
    return NextResponse.json(
      {
        success: true,
        tenantId: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        active: isActive,
        source: tenant.source,
        planCode: tenant.plan_code,
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
