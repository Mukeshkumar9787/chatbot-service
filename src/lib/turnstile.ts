import { NextRequest } from "next/server";
import { getClientIp } from "./rateLimit";

export interface TurnstileVerificationResult {
  success: boolean;
  skipped?: boolean;
  error?: string;
  errorCodes?: string[];
}

/**
 * Cloudflare Turnstile CAPTCHA server-side token verification.
 * Follows strict zero-hardcoding standards for environment keys.
 */
export async function verifyTurnstile(
  token: string | null | undefined,
  req?: NextRequest
): Promise<TurnstileVerificationResult> {
  const secretKey = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;

  if (!secretKey) {
    // If unconfigured, allow gracefully with explicit warning
    console.warn(
      "[Turnstile] CLOUDFLARE_TURNSTILE_SECRET_KEY is not configured. Skipping server verification."
    );
    return { success: true, skipped: true };
  }

  if (!token || typeof token !== "string" || !token.trim()) {
    return {
      success: false,
      error: "Cloudflare Turnstile verification token is required.",
    };
  }

  try {
    const formData = new URLSearchParams();
    formData.append("secret", secretKey);
    formData.append("response", token.trim());

    // Do NOT pass remoteip behind reverse proxies (like Vercel)
    // Cloudflare documentation explicitly advises against remoteip if behind proxies
    // as IP mismatch will cause siteverify rejection.

    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    const data = await response.json();

    if (!data.success) {
      console.warn("[Turnstile] Cloudflare siteverify rejected token:", data["error-codes"]);
      const isDuplicate = data["error-codes"]?.includes("timeout-or-duplicate");
      return {
        success: false,
        error: isDuplicate
          ? "CAPTCHA verification expired or already used. Please complete verification again."
          : "Cloudflare Turnstile CAPTCHA verification failed. Please try again.",
        errorCodes: data["error-codes"] || [],
      };
    }

    return { success: true };
  } catch (error: any) {
    console.error("[Turnstile] Error calling Cloudflare siteverify endpoint:", error);
    return {
      success: false,
      error: "Failed to verify Cloudflare Turnstile token due to an upstream network error.",
    };
  }
}

