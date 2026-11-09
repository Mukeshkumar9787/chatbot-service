import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { userStore, RAGUser } from "./userStore";
import { NextRequest, NextResponse } from "next/server";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.warn("[Auth Warning] JWT_SECRET environment variable is not defined.");
}
const JWT_EXPIRES_IN = "7d";

export function createToken(payload: { id: string; email: string; role: string }) {
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

/**
 * Authenticates request and ensures user is an active administrator.
 * Automatically checks for revocation.
 */
export async function authenticateAdmin(
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

  // Identify user primarily by email
  if (decoded.email) {
    user = await userStore.getUserByEmail(decoded.email);
  }

  // Fallback to internal user ID
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

  // Live Revocation Check:
  if (!user.is_active || user.role === "INACTIVE") {
    return {
      errorResponse: NextResponse.json(
        { error: "ACCESS_REVOKED: Your administrator privileges have been revoked." },
        { status: 403 }
      ),
    };
  }

  if (user.role !== "SUPPORT_ADMIN") {
    return {
      errorResponse: NextResponse.json(
        { error: "ACCESS_REVOKED: Administrator permissions required." },
        { status: 403 }
      ),
    };
  }

  return { user };
}

