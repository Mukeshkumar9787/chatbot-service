import { NextRequest, NextResponse } from "next/server";
import { userStore } from "@/lib/userStore";
import { comparePassword, createToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

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

