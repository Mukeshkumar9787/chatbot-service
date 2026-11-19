import { NextRequest, NextResponse } from "next/server";
import { userStore } from "@/lib/userStore";
import { comparePassword, createToken } from "@/lib/auth";
import {
  authRateLimiter,
  getClientIp,
  createRateLimitResponse,
} from "@/lib/rateLimit";
import { verifyTurnstile } from "@/lib/turnstile";
import { runWithTenant } from "@/lib/tenantContext";

interface RouteContext {
  params: Promise<{ tenantId: string }> | { tenantId: string };
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const params = await context.params;
    const rawTenantId = params.tenantId?.trim() || "tenant_smk_default";
    const { dbTenantStore } = await import("@/lib/db");
    const resolvedTenant = await dbTenantStore.getTenantByIdOrSlug(rawTenantId);
    const tenantId = resolvedTenant?.id || rawTenantId;

    return await runWithTenant(tenantId, async () => {
      const clientIp = getClientIp(req);
      const rateLimitResult = authRateLimiter.check(clientIp, {
        windowMs: 15 * 60 * 1000,
        maxRequests: 10,
      });

      if (!rateLimitResult.allowed) {
        return createRateLimitResponse(
          rateLimitResult,
          "Too many sign-in attempts. Please wait 15 minutes before trying again."
        );
      }

      const body = await req.json();
      // Strictly strip tenant fields from body - URL parameter rules
      delete body.tenantId;
      delete body.tenant_id;
      delete body.tenantSlug;
      delete body.tenant;

      const { email, password } = body;

      // Verify Turnstile token (bypassed for platform admin)
      if (tenantId !== "platform") {
        const turnstileToken =
          body.turnstileToken ||
          body["cf-turnstile-response"] ||
          body.cfTurnstileResponse ||
          body.token ||
          req.headers.get("x-turnstile-token") ||
          req.headers.get("cf-turnstile-token") ||
          req.headers.get("cf-turnstile-response");

        const turnstileResult = await verifyTurnstile(turnstileToken, req);
        if (!turnstileResult.success) {
          return NextResponse.json(
            {
              success: false,
              error:
                turnstileResult.error ||
                "Cloudflare Turnstile CAPTCHA verification failed.",
              errorCodes: turnstileResult.errorCodes,
            },
            { status: 400 }
          );
        }
      }

      if (!email || !password) {
        return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
      }

      // Check platform admin table if logging in via platform route
      if (tenantId === "platform") {
        const { dbPlatformAdminStore } = await import("@/lib/db");
        const plAdmin = await dbPlatformAdminStore.getByEmail(email.toLowerCase().trim());
        if (plAdmin && comparePassword(password, plAdmin.password_hash)) {
          const token = createToken({
            id: plAdmin.id,
            email: plAdmin.email,
            role: plAdmin.role,
            tenant_id: "system",
          });
          return NextResponse.json({
            success: true,
            token,
            tenant_id: "platform",
            user: {
              id: plAdmin.id,
              email: plAdmin.email,
              name: plAdmin.name,
              role: plAdmin.role,
              tenant_id: "system",
            },
          });
        }
      }

      const user = await userStore.getUserByEmail(email, tenantId);
      if (!user || !user.is_active || user.role === "INACTIVE") {
        return NextResponse.json({ error: "Invalid credentials or account inactive" }, { status: 401 });
      }

      if (!user.password_hash || !comparePassword(password, user.password_hash)) {
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
      }

      const canonicalTenantId = user.tenant_id || tenantId;
      const token = createToken({
        id: user.id,
        email: user.email,
        role: user.role,
        tenant_id: canonicalTenantId,
      });

      return NextResponse.json({
        success: true,
        token,
        tenant_id: canonicalTenantId,
        tenantSlug: resolvedTenant?.slug || rawTenantId,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenant_id: canonicalTenantId,
        },
      });
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
