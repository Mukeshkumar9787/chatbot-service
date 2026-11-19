import { NextRequest, NextResponse } from "next/server";
import { authenticateSupportUser } from "@/lib/auth";
import { dbTenantStore } from "@/lib/db";

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
    return NextResponse.json({ success: true, tenant });
  } catch (err: any) {
    console.error("[Get Tenant Error]:", err);
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
    const body = await req.json().catch(() => ({}));
    const { status, name, aiChatbotEnabled, settings } = body;

    const existing = await dbTenantStore.getTenantByIdOrSlug(params.id);
    if (!existing) {
      return NextResponse.json({ error: "Tenant not found." }, { status: 404 });
    }

    if (status && status !== "ACTIVE" && status !== "INACTIVE") {
      return NextResponse.json(
        { error: "Status must be either 'ACTIVE' or 'INACTIVE'." },
        { status: 400 }
      );
    }

    const updated = await dbTenantStore.createTenant({
      id: existing.id,
      slug: existing.slug,
      name: name !== undefined ? String(name).trim() : existing.name,
      status: status !== undefined ? status : existing.status,
      source: existing.source,
      planCode: existing.plan_code || undefined,
      aiChatbotEnabled:
        aiChatbotEnabled !== undefined
          ? Boolean(aiChatbotEnabled)
          : status === "INACTIVE"
          ? false
          : existing.ai_chatbot_enabled,
      settings: settings !== undefined ? settings : existing.settings,
    });

    return NextResponse.json({ success: true, tenant: updated });
  } catch (err: any) {
    console.error("[Update Tenant Error]:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
