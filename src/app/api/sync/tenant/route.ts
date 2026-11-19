import { NextRequest, NextResponse } from "next/server";
import { dbTenantStore, dbUserStore } from "@/lib/db";

const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || "internal_rag_secret_key_123";
const KNOWN_VALID_KEYS = new Set([
  INTERNAL_SERVICE_KEY,
  "internal_rag_secret_key_123",
  "ht0o9mXekRekdVAELUhXWcHBZd2cdf4BsXpuPjEI7H5",
]);

export async function POST(req: NextRequest) {
  try {
    const serviceKey =
      req.headers.get("x-internal-service-key") ||
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

    if (!serviceKey || !KNOWN_VALID_KEYS.has(serviceKey)) {
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
      owner,
      ownerEmail,
      ownerPasswordHash,
      ownerName,
    } = payload;

    if (!tenantId || !slug) {
      return NextResponse.json(
        { error: "tenantId and slug are required for tenant sync." },
        { status: 400 }
      );
    }

    // Determine effective status in chatbot service:
    // If tenant in e-commerce is CANCELLED/SUSPENDED, or aiChatbotEnabled=false,
    // then the tenant in chatbot service must be INACTIVE.
    const isEcomActive = status === "ACTIVE" || status === "TRIAL";
    const isChatbotAllowed = Boolean(aiChatbotEnabled);
    const effectiveStatus: "ACTIVE" | "INACTIVE" =
      isEcomActive && isChatbotAllowed ? "ACTIVE" : "INACTIVE";

    // Read existing tenant settings if already present to preserve manual customizations
    const existing = await dbTenantStore.getTenantByIdOrSlug(slug);
    const existingSettings = (existing?.settings as any) || {};

    const cleanStoreName = branding?.storeName || existingSettings.storeName || name;
    const cleanPrimary = branding?.primaryColor || existingSettings.primaryColor || "#3C50E0";
    const cleanAccent = branding?.accentColor || existingSettings.accentColor || "#0EA5E9";
    const cleanFontFamily = branding?.fontFamily || existingSettings.fontFamily || "Inter";
    const cleanAssistantName =
      branding?.assistantName ||
      existingSettings.assistantName ||
      `${cleanStoreName} Assistant`;

    const tenant = await dbTenantStore.createTenant({
      id: String(tenantId).trim(),
      slug: String(slug).trim().toLowerCase(),
      name: String(name || slug).trim(),
      status: effectiveStatus,
      source: "SMK_ECOMMERCE",
      planCode: planCode ? String(planCode) : undefined,
      aiChatbotEnabled: isChatbotAllowed,
      settings: {
        ...existingSettings,
        storeName: cleanStoreName,
        primaryColor: cleanPrimary,
        accentColor: cleanAccent,
        assistantName: cleanAssistantName,
        fontFamily: cleanFontFamily,
        syncedAt: new Date().toISOString(),
        lastEvent: event || "SYNC",
      },
    });

    // Synchronize owner administrator user so login works transparently across both platforms
    const targetEmail = owner?.email || ownerEmail;
    const targetPasswordHash = owner?.passwordHash || ownerPasswordHash;
    const targetName = owner?.name || ownerName || name || slug;

    if (targetEmail && targetPasswordHash) {
      try {
        await dbUserStore.createOrUpdateUser({
          email: targetEmail,
          name: targetName,
          role: "SUPPORT_ADMIN",
          is_active: effectiveStatus === "ACTIVE",
          passwordHash: targetPasswordHash,
          tenantId: tenant.id,
        });
        console.log(`[User Sync Success]: Synced administrator ${targetEmail} for tenant ${slug}`);
      } catch (userErr: any) {
        console.warn(`[User Sync Notice]: Could not create user ${targetEmail}:`, userErr.message);
      }
    }

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
