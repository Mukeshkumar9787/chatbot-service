import { NextRequest, NextResponse } from "next/server";

export interface RateLimitOptions {
  windowMs: number; // Duration of window in milliseconds
  maxRequests: number; // Max requests allowed per window
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
}

interface ClientRecord {
  timestamps: number[];
}

/**
 * In-memory sliding-window counter rate limiter store.
 */
class InMemoryRateLimiter {
  private store: Map<string, ClientRecord> = new Map();
  private lastCleanup: number = Date.now();
  private cleanupIntervalMs: number = 60 * 1000; // 1 minute cleanup

  /**
   * Evaluates if a request from the given client key is permitted.
   */
  public check(key: string, options: RateLimitOptions): RateLimitResult {
    const now = Date.now();
    this.maybeCleanup(options.windowMs);

    const record = this.store.get(key) || { timestamps: [] };
    const windowStart = now - options.windowMs;

    // Filter out timestamps outside the sliding window
    const validTimestamps = record.timestamps.filter((ts) => ts > windowStart);

    if (validTimestamps.length >= options.maxRequests) {
      const oldestValid = validTimestamps[0];
      const resetTimeMs = oldestValid + options.windowMs - now;
      const resetSeconds = Math.max(1, Math.ceil(resetTimeMs / 1000));

      return {
        allowed: false,
        limit: options.maxRequests,
        remaining: 0,
        resetSeconds,
      };
    }

    // Record this request
    validTimestamps.push(now);
    this.store.set(key, { timestamps: validTimestamps });

    const remaining = Math.max(0, options.maxRequests - validTimestamps.length);
    const resetSeconds = Math.ceil(options.windowMs / 1000);

    return {
      allowed: true,
      limit: options.maxRequests,
      remaining,
      resetSeconds,
    };
  }

  /**
   * Resets rate limiter memory store (useful in test suites).
   */
  public reset(): void {
    this.store.clear();
  }

  private maybeCleanup(windowMs: number) {
    const now = Date.now();
    if (now - this.lastCleanup < this.cleanupIntervalMs) return;

    this.lastCleanup = now;
    const windowStart = now - windowMs;

    this.store.forEach((record, key) => {
      const filtered = record.timestamps.filter((ts) => ts > windowStart);
      if (filtered.length === 0) {
        this.store.delete(key);
      } else {
        this.store.set(key, { timestamps: filtered });
      }
    });
  }
}

// Global instances for Chat and Auth
export const chatRateLimiter = new InMemoryRateLimiter();
export const authRateLimiter = new InMemoryRateLimiter();

/**
 * Extracts client IP identifier from Next.js request.
 */
export function getClientIp(req: NextRequest): string {
  const cfConnectingIp = req.headers.get("cf-connecting-ip");
  if (cfConnectingIp) return cfConnectingIp.trim();

  const xForwardedFor = req.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    const firstIp = xForwardedFor.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }

  const xRealIp = req.headers.get("x-real-ip");
  if (xRealIp) return xRealIp.trim();

  return "127.0.0.1";
}

/**
 * Creates a standard 429 Too Many Requests response with HTTP rate limit headers.
 */
export function createRateLimitResponse(
  result: RateLimitResult,
  customMessage = "Please wait a moment before trying again."
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: customMessage,
      retryAfterSeconds: result.resetSeconds,
    },
    {
      status: 429,
      headers: {
        "Retry-After": result.resetSeconds.toString(),
        "X-RateLimit-Limit": result.limit.toString(),
        "X-RateLimit-Remaining": result.remaining.toString(),
        "X-RateLimit-Reset": result.resetSeconds.toString(),
      },
    }
  );
}
