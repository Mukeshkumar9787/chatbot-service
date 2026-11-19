import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { userStore, RAGUser } from "./userStore";
import { dbPlatformAdminStore } from "./db";
import { NextRequest, NextResponse } from "next/server";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.warn("[Auth Warning] JWT_SECRET environment variable is not defined.");
}
const JWT_EXPIRES_IN = "7d";

export function createToken(payload: { id: string; email: string; role: string; tenant_id?: string }) {
  if (!JWT_SECRET) throw new Error("JWT_SECRET is not configured on the server");
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): any {
  if (!JWT_SECRET) throw new Error("JWT_SECRET is not configured on the server");
  return jwt.verify(token, JWT_SECRET);
}

export function comparePassword(plain: string, hash: string): boolean {
  return bcrypt.compareSync(plain, hash);
}

export async function areTenantsMatching(tenantA?: string, tenantB?: string): Promise<boolean> {
  if (!tenantA || !tenantB) return true;
  if (tenantA === tenantB) return true;
  if (
    tenantA === "system" ||
    tenantA === "platform" ||
    tenantB === "system" ||
    tenantB === "platform"
  ) {
    return true;
  }
  try {
    const { dbTenantStore } = await import("./db");
    const [resolvedA, resolvedB] = await Promise.all([
      dbTenantStore.getTenantByIdOrSlug(tenantA),
      dbTenantStore.getTenantByIdOrSlug(tenantB),
    ]);
    const canonicalA = resolvedA?.id || tenantA;
    const canonicalB = resolvedB?.id || tenantB;
    return canonicalA === canonicalB;
  } catch (err) {
    return false;
  }
}

/**
 * Authenticates request and ensures user is an active administrator for the given tenant.
 * Automatically checks for revocation.
 */
export async function authenticateAdmin(
  req: NextRequest,
  expectedTenantId?: string
): Promise<{ user: RAGUser } | { errorResponse: NextResponse }> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      errorResponse: NextResponse.json(
        { error: "Unauthorized: Missing authentication token" },
        { status: 401 }
      ),
    };
  }

  const token = authHeader.split(" ")[1];
  if (await userStore.isTokenBlacklisted(token)) {
    return {
      errorResponse: NextResponse.json(
        { error: "Unauthorized: Token revoked" },
        { status: 401 }
      ),
    };
  }

  let decoded: any;
  try {
    decoded = verifyToken(token);
  } catch (err: any) {
    return {
      errorResponse: NextResponse.json(
        { error: `Unauthorized: ${err.message}` },
        { status: 401 }
      ),
    };
  }

  const targetTenantId = expectedTenantId || decoded.tenant_id;
  if (expectedTenantId && decoded.tenant_id && !(await areTenantsMatching(expectedTenantId, decoded.tenant_id))) {
    return {
      errorResponse: NextResponse.json(
        { error: "Unauthorized: Token tenant does not match requested route tenant" },
        { status: 403 }
      ),
    };
  }

  let user: RAGUser | null = null;

  // Identify user primarily by email and tenant
  if (decoded.email) {
    user = await userStore.getUserByEmail(decoded.email, targetTenantId);
  }

  // Fallback to internal user ID and tenant
  if (!user && (decoded.id || decoded.sub)) {
    user = await userStore.getUserById(String(decoded.id || decoded.sub), targetTenantId);
  }

  if (!user) {
    return {
      errorResponse: NextResponse.json(
        { error: "Unauthorized: User not found in Knowledge Base system" },
        { status: 401 }
      ),
    };
  }

  // Live Revocation Check:
  if (!user.is_active || user.role === "INACTIVE") {
    return {
      errorResponse: NextResponse.json(
        { error: "ACCESS_REVOKED: Your administrator privileges have been revoked." },
        { status: 403 }
      ),
    };
  }

  if (user.role !== "SUPPORT_ADMIN" && user.role !== "SUPER_ADMIN") {
    return {
      errorResponse: NextResponse.json(
        { error: "ACCESS_REVOKED: Administrator permissions required." },
        { status: 403 }
      ),
    };
  }

  return { user };
}

/**
 * Authenticates platform support / super-admin requests.
 */
export async function authenticateSupportUser(
  req: NextRequest
): Promise<{ user: RAGUser } | { errorResponse: NextResponse }> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      errorResponse: NextResponse.json(
        { error: "Unauthorized: Missing authentication token" },
        { status: 401 }
      ),
    };
  }

  const token = authHeader.split(" ")[1];
  if (await userStore.isTokenBlacklisted(token)) {
    return {
      errorResponse: NextResponse.json(
        { error: "Unauthorized: Token revoked" },
        { status: 401 }
      ),
    };
  }

  let decoded: any;
  try {
    decoded = verifyToken(token);
  } catch (err: any) {
    return {
      errorResponse: NextResponse.json(
        { error: `Unauthorized: ${err.message}` },
        { status: 401 }
      ),
    };
  }

  let user: RAGUser | null = null;
  if (decoded.email) {
    const plAdmin = await dbPlatformAdminStore.getByEmail(decoded.email);
    if (plAdmin && plAdmin.is_active) {
      return {
        user: {
          id: plAdmin.id,
          email: plAdmin.email,
          name: plAdmin.name,
          role: plAdmin.role,
          is_active: plAdmin.is_active,
          created_at: plAdmin.created_at?.toISOString() || "",
          updated_at: plAdmin.updated_at?.toISOString() || "",
        },
      };
    }
    user = await userStore.getUserByEmail(decoded.email, decoded.tenant_id || "system");
  }
  if (!user && (decoded.id || decoded.sub)) {
    user = await userStore.getUserById(String(decoded.id || decoded.sub), decoded.tenant_id || "system");
  }

  if (!user || !user.is_active || (user.role !== "SUPER_ADMIN" && user.role !== "SUPPORT_ADMIN")) {
    return {
      errorResponse: NextResponse.json(
        { error: "Forbidden: Platform Support privileges required." },
        { status: 403 }
      ),
    };
  }

  return { user };
}

/**
 * Authenticates request and ensures user is an active logged-in user (SUPPORT_ADMIN or SUPPORT_OPERATOR).
 * Automatically checks for revocation and blacklisting.
 */
export async function authenticateUser(
  req: NextRequest,
  expectedTenantId?: string
): Promise<{ user: RAGUser } | { errorResponse: NextResponse }> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      errorResponse: NextResponse.json(
        { error: "Unauthorized: Missing authentication token" },
        { status: 401 }
      ),
    };
  }

  const token = authHeader.split(" ")[1];
  if (await userStore.isTokenBlacklisted(token)) {
    return {
      errorResponse: NextResponse.json(
        { error: "Unauthorized: Token revoked" },
        { status: 401 }
      ),
    };
  }

  let decoded: any;
  try {
    decoded = verifyToken(token);
  } catch (err: any) {
    return {
      errorResponse: NextResponse.json(
        { error: `Unauthorized: ${err.message}` },
        { status: 401 }
      ),
    };
  }

  const targetTenantId = expectedTenantId || decoded.tenant_id;
  if (expectedTenantId && decoded.tenant_id && !(await areTenantsMatching(expectedTenantId, decoded.tenant_id))) {
    return {
      errorResponse: NextResponse.json(
        { error: "Unauthorized: Token tenant does not match requested route tenant" },
        { status: 403 }
      ),
    };
  }

  let user: RAGUser | null = null;
  if (decoded.email) {
    user = await userStore.getUserByEmail(decoded.email, targetTenantId);
  }
  if (!user && (decoded.id || decoded.sub)) {
    user = await userStore.getUserById(String(decoded.id || decoded.sub), targetTenantId);
  }
  if (!user && (decoded.id || decoded.sub)) {
    user = await userStore.getUserById(String(decoded.id || decoded.sub));
  }

  if (!user) {
    return {
      errorResponse: NextResponse.json(
        { error: "Unauthorized: User not found in Knowledge Base system" },
        { status: 401 }
      ),
    };
  }

  if (!user.is_active || user.role === "INACTIVE") {
    return {
      errorResponse: NextResponse.json(
        { error: "ACCESS_REVOKED: Your account has been deactivated." },
        { status: 403 }
      ),
    };
  }

  return { user };
}


