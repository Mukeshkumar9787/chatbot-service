import { NextRequest, NextResponse } from "next/server";
import { userStore } from "@/lib/userStore";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const internalKey = process.env.INTERNAL_SERVICE_KEY;
  if (!internalKey) {
    return NextResponse.json(
      { error: "Server configuration error: INTERNAL_SERVICE_KEY is not defined" },
      { status: 500 }
    );
  }

  const secret = req.headers.get("x-internal-service-key");
  if (!secret || secret !== internalKey) {
    return NextResponse.json({ error: "Unauthorized: Invalid service key" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { email, role, status = "ACTIVE", name = "" } = body;

    if (!email) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }

    const isAdmin = String(role).toUpperCase() === "ADMIN" || String(role).toUpperCase() === "SUPER_ADMIN";
    const isActive = isAdmin && String(status).toUpperCase() === "ACTIVE";
    const ragRole = isActive ? "SUPPORT_ADMIN" : "INACTIVE";

    const user = await userStore.createOrUpdateUser({
      email,
      name: name || email,
      role: ragRole,
      is_active: isActive,
    });

    console.log(`[Sync] Synced user ${email} -> role: ${ragRole}, active: ${isActive}`);

    return NextResponse.json({
      success: true,
      message: `User ${email} role synced successfully.`,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        is_active: user.is_active,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

