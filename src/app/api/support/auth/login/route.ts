import { NextRequest, NextResponse } from "next/server";
import { userStore } from "@/lib/userStore";
import { comparePassword, createToken } from "@/lib/auth";
import { verifyTurnstile } from "@/lib/turnstile";
import { initDatabase, dbPlatformAdminStore } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    await initDatabase();
    const body = await req.json().catch(() => ({}));
    const { email, password, turnstileToken } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    // Optional turnstile check
    if (process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY && turnstileToken) {
      const turnstileResult = await verifyTurnstile(turnstileToken);
      if (!turnstileResult.success) {
        return NextResponse.json(
          { error: turnstileResult.error || "Cloudflare Turnstile verification failed" },
          { status: 403 }
        );
      }
    }

    const emailNorm = String(email).toLowerCase().trim();

    // 1. Check dedicated platform_admins table
    const plAdmin = await dbPlatformAdminStore.getByEmail(emailNorm);
    if (plAdmin) {
      if (!plAdmin.is_active) {
        return NextResponse.json(
          { error: "Platform Admin account is inactive." },
          { status: 403 }
        );
      }
      if (!comparePassword(password, plAdmin.password_hash)) {
        return NextResponse.json(
          { error: "Invalid support credentials." },
          { status: 401 }
        );
      }
      const token = createToken({
        id: plAdmin.id,
        email: plAdmin.email,
        role: plAdmin.role,
        tenant_id: "system",
      });
      return NextResponse.json({
        success: true,
        token,
        user: {
          id: plAdmin.id,
          email: plAdmin.email,
          name: plAdmin.name,
          role: plAdmin.role,
        },
      });
    }

    // 2. Fallback to system userStore
    const user = await userStore.getUserByEmail(emailNorm, "system");

    if (!user) {
      return NextResponse.json(
        { error: "Invalid support credentials." },
        { status: 401 }
      );
    }

    if (!user.is_active || user.role === "INACTIVE") {
      return NextResponse.json(
        { error: "Support account is inactive. Please contact system administrator." },
        { status: 403 }
      );
    }

    if (user.role !== "SUPER_ADMIN" && user.role !== "SUPPORT_ADMIN") {
      return NextResponse.json(
        { error: "Forbidden: Super Administrator or Support privileges required." },
        { status: 403 }
      );
    }

    if (!user.password_hash || !comparePassword(password, user.password_hash)) {
      return NextResponse.json(
        { error: "Invalid support credentials." },
        { status: 401 }
      );
    }

    const token = createToken({
      id: user.id,
      email: user.email,
      role: user.role,
      tenant_id: user.tenant_id || "system",
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
    console.error("[Support Login Error]:", err);
    return NextResponse.json(
      { error: "Login failed: " + (err.message || "Unknown error") },
      { status: 500 }
    );
  }
}
