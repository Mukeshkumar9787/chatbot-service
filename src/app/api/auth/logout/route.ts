import { NextRequest, NextResponse } from "next/server";
import { userStore } from "@/lib/userStore";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    let token = "";
    const authHeader = req.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1].trim();
    }

    if (!token) {
      try {
        const body = await req.json();
        token = body.token || "";
      } catch {
        // Body was empty or not JSON
      }
    }

    if (token) {
      await userStore.blacklistToken(token);
    }

    return NextResponse.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Logout failed" },
      { status: 500 }
    );
  }
}

