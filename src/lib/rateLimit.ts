import { NextResponse } from "next/server";

interface MemoryRateBucket {
  count: number;
  resetAt: number;
}

const MAX_RATE_BUCKETS = 2000;
const rateBuckets = new Map<string, MemoryRateBucket>();

/**
 * Extracts normalized client IP from forwarding headers for telemetry & rate limits.
 * Prefers trusted single-hop platform headers (`x-vercel-forwarded-for`, `x-real-ip`)
 * before reading the rightmost proxy-appended entry of `x-forwarded-for`.
 */
export function extractNormalizedClientIp(headers: Headers): string {
  const isVercel =
    process.env.VERCEL === "1" ||
    process.env.NODE_ENV === "test" ||
    Boolean(process.env.VITEST);
  const vercelForwarded = isVercel
    ? headers.get("x-vercel-forwarded-for")
    : null;
  const vercelIp = vercelForwarded?.split(",")[0]?.trim();
  const realIp = headers.get("x-real-ip")?.trim();
  const forwardedParts = (headers.get("x-forwarded-for") || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const proxyAppendedIp =
    forwardedParts.length > 0
      ? forwardedParts[forwardedParts.length - 1]
      : undefined;

  const rawIp = vercelIp || realIp || proxyAppendedIp || "127.0.0.1";
  return rawIp.replace(/^::ffff:/i, "");
}

function pruneExpiredBuckets(now: number): void {
  if (rateBuckets.size < MAX_RATE_BUCKETS) return;
  for (const [key, bucket] of rateBuckets.entries()) {
    if (bucket.resetAt <= now) {
      rateBuckets.delete(key);
    }
  }
  while (rateBuckets.size >= MAX_RATE_BUCKETS) {
    const oldestKey = rateBuckets.keys().next().value;
    if (!oldestKey) break;
    rateBuckets.delete(oldestKey);
  }
}

/**
 * Fixed-window per-instance rate limiter for high-volume public API endpoints.
 */
export function checkMemoryRateLimit(
  bucketKey: string,
  options: { limit: number; windowMs: number }
): { allowed: boolean; remaining: number; retryAfterSec: number } {
  const now = Date.now();
  const existing = rateBuckets.get(bucketKey);

  if (!existing || existing.resetAt <= now) {
    pruneExpiredBuckets(now);
    rateBuckets.set(bucketKey, {
      count: 1,
      resetAt: now + options.windowMs,
    });
    return {
      allowed: true,
      remaining: Math.max(0, options.limit - 1),
      retryAfterSec: 0,
    };
  }

  if (existing.count >= options.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: Math.max(0, options.limit - existing.count),
    retryAfterSec: 0,
  };
}

export function createRateLimitResponse(
  retryAfterSec: number,
  message?: string
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error:
        message ||
        `Too many requests. Please try again in ${retryAfterSec} seconds.`,
      retryAfterSec,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSec),
        "Cache-Control": "no-store",
      },
    }
  );
}
