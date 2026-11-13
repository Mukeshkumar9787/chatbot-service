import { NextRequest, NextResponse } from "next/server";
import { userStore } from "@/lib/userStore";
import { comparePassword, createToken } from "@/lib/auth";
import {
  authRateLimiter,
  getClientIp,
  createRateLimitResponse,
} from "@/lib/rateLimit";
import { verifyTurnstile } from "@/lib/turnstile";

export async function POST(req: NextRequest) {
  try {
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
    const { email, password } = body;

    // Verify Turnstile token
    const turnstileToken =
      body.turnstileToken ||
      req.headers.get("x-turnstile-token") ||
      req.headers.get("cf-turnstile-token");

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

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const user = await userStore.getUserByEmail(email);
    if (!user || !user.is_active || user.role === "INACTIVE") {
      return NextResponse.json({ error: "Invalid credentials or account inactive" }, { status: 401 });
    }

    if (!user.password_hash || !comparePassword(password, user.password_hash)) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const token = createToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    return NextResponse.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

