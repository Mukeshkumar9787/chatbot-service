import { NextRequest, NextResponse } from "next/server";
import { userStore } from "@/lib/userStore";
import { runWithTenant } from "@/lib/tenantContext";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ tenantId: string }> | { tenantId: string };
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const params = await context.params;
    const tenantId = params.tenantId?.trim() || "tenant_smk_default";

    return await runWithTenant(tenantId, async () => {
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
        tenant_id: tenantId,
        message: "Logged out successfully",
      });
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Logout failed" },
      { status: 500 }
    );
  }
}
