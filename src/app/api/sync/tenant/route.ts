import { NextRequest, NextResponse } from "next/server";
import { dbTenantStore } from "@/lib/db";

const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || "internal_rag_secret_key_123";

export async function POST(req: NextRequest) {
  try {
    const serviceKey =
      req.headers.get("x-internal-service-key") ||
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

    if (!serviceKey || serviceKey !== INTERNAL_SERVICE_KEY) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing internal service key." },
        { status: 401 }
      );
    }

    const payload = await req.json().catch(() => ({}));
    const {
      event,
      tenantId,
      slug,
      name,
      status = "ACTIVE",
      aiChatbotEnabled = true,
      planCode,
      branding,
    } = payload;

    if (!tenantId || !slug) {
      return NextResponse.json(
        { error: "tenantId and slug are required for tenant sync." },
        { status: 400 }
      );
    }

    // Determine effective status in chatbot service:
    // If tenant in e-commerce is CANCELLED/SUSPENDED, or the plan has aiChatbotEnabled=false,
    // then the tenant in chatbot service must be INACTIVE.
    const isEcomActive = status === "ACTIVE" || status === "TRIAL";
    const isChatbotAllowed = Boolean(aiChatbotEnabled);
    const effectiveStatus: "ACTIVE" | "INACTIVE" =
      isEcomActive && isChatbotAllowed ? "ACTIVE" : "INACTIVE";

    const tenant = await dbTenantStore.createTenant({
      id: String(tenantId).trim(),
      slug: String(slug).trim().toLowerCase(),
      name: String(name || slug).trim(),
      status: effectiveStatus,
      source: "SMK_ECOMMERCE",
      planCode: planCode ? String(planCode) : undefined,
      aiChatbotEnabled: isChatbotAllowed,
      settings: {
        storeName: branding?.storeName || name,
        primaryColor: branding?.primaryColor,
        syncedAt: new Date().toISOString(),
        lastEvent: event || "SYNC",
      },
    });

    console.log(
      `[Tenant Sync Success]: Synced ${slug} (${tenantId}) -> status: ${effectiveStatus} (event: ${event})`
    );

    return NextResponse.json({
      success: true,
      message: `Tenant ${slug} synchronized successfully`,
      tenant,
    });
  } catch (err: any) {
    console.error("[Tenant Sync Error]:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
