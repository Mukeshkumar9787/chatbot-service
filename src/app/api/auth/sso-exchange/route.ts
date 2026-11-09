import { NextRequest, NextResponse } from "next/server";
import { verifyToken, createToken } from "@/lib/auth";
import { userStore } from "@/lib/userStore";

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();

    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    let decoded: any;
    try {
      decoded = verifyToken(token);
    } catch (err: any) {
      return NextResponse.json({ error: `Invalid token: ${err.message}` }, { status: 401 });
    }

    const email = decoded.email?.toLowerCase().trim();
    if (!email) {
      return NextResponse.json({ error: "Malformed token: missing email identifier" }, { status: 401 });
    }

    let user = await userStore.getUserByEmail(email);

    // Auto-bootstrap initial admin if not synced yet
    if (!user) {
      user = await userStore.createOrUpdateUser({
        email,
        name: decoded.name || email.split("@")[0] || "Administrator",
        role: "SUPPORT_ADMIN",
        is_active: true,
      });
    }

    // Role revocation check
    if (!user.is_active || user.role === "INACTIVE") {
      return NextResponse.json(
        { error: "ACCESS_REVOKED: Your administrator privileges have been revoked." },
        { status: 403 }
      );
    }

    const sessionToken = createToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    return NextResponse.json({
      success: true,
      token: sessionToken,
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

