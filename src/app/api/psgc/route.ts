import { NextResponse } from "next/server";
import {
  checkMemoryRateLimit,
  createRateLimitResponse,
  extractNormalizedClientIp,
} from "@/lib/rateLimit";

const PSGC_BASE_URL = "https://psgc.gitlab.io/api";
const CODE_PATTERN = /^[0-9]{9,10}$/;

export async function GET(request: Request) {
  const clientIp = extractNormalizedClientIp(request.headers);
  const rate = checkMemoryRateLimit(`psgc:${clientIp}`, {
    limit: 90,
    windowMs: 60 * 1000,
  });
  if (!rate.allowed) {
    return createRateLimitResponse(rate.retryAfterSec);
  }

  const { searchParams } = new URL(request.url);
  const level = searchParams.get("level") || "";
  const scope = searchParams.get("scope") || "province";
  const code = searchParams.get("code") || "";

  let targetUrl: string | null = null;

  if (level === "regions") {
    targetUrl = `${PSGC_BASE_URL}/regions/`;
  } else if (level === "provinces" && CODE_PATTERN.test(code)) {
    targetUrl = `${PSGC_BASE_URL}/regions/${code}/provinces/`;
  } else if (level === "cities" && CODE_PATTERN.test(code)) {
    targetUrl =
      scope === "region"
        ? `${PSGC_BASE_URL}/regions/${code}/cities-municipalities/`
        : `${PSGC_BASE_URL}/provinces/${code}/cities-municipalities/`;
  } else if (level === "barangays" && CODE_PATTERN.test(code)) {
    targetUrl = `${PSGC_BASE_URL}/cities-municipalities/${code}/barangays/`;
  }

  if (!targetUrl) {
    return NextResponse.json(
      { error: "Invalid PSGC query parameters." },
      { status: 400 }
    );
  }

  try {
    const upstream = await fetch(targetUrl, {
      headers: { Accept: "application/json" },
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(8500),
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `PSGC upstream returned HTTP ${upstream.status}.` },
        { status: 502 }
      );
    }

    const data = await upstream.json();
    return NextResponse.json(data, {
      headers: {
        "Cache-Control":
          "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "PSGC service unreachable. Check your internet connection." },
      { status: 503 }
    );
  }
}

