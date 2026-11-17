import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAnalyticsEvents, type AnalyticsEventInput } from "@/lib/db";
import {
  checkMemoryRateLimit,
  createRateLimitResponse,
  extractNormalizedClientIp,
} from "@/lib/rateLimit";

const singleEventSchema = z.object({
  type: z.enum([
    "page_view",
    "chapter_view",
    "project_click",
    "contact_click",
    "cv_download",
  ]),
  target: z.string().trim().min(1).max(200),
  sessionId: z.string().trim().min(4).max(64).optional(),
  device: z.enum(["desktop", "tablet", "mobile"]).optional(),
  referrer: z.string().trim().max(120).optional(),
});

const batchSchema = z.object({
  events: z.array(singleEventSchema).min(1).max(25),
});

const BOT_UA_PATTERN =
  /bot|crawl|spider|slurp|lighthouse|headlesschrome|prerender|preview|facebookexternalhit|twitterbot/i;

function sanitizeReferrer(raw?: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return undefined;
  if (trimmed === "direct" || trimmed === "internal") return trimmed;

  try {
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      const host = new URL(trimmed).hostname.replace(/^www\./, "").slice(0, 80);
      return host || undefined;
    }
  } catch {
    return undefined;
  }

  const hostOnly = trimmed.replace(/^www\./, "").slice(0, 80);
  return /^[a-z0-9.-]+$/i.test(hostOnly) ? hostOnly : undefined;
}

export async function POST(request: Request) {
  try {
    const clientIp = extractNormalizedClientIp(request.headers);
    const rate = checkMemoryRateLimit(`analytics:${clientIp}`, {
      limit: 60,
      windowMs: 60 * 1000,
    });
    if (!rate.allowed) {
      return createRateLimitResponse(rate.retryAfterSec);
    }

    const userAgent = request.headers.get("user-agent") || "";
    if (BOT_UA_PATTERN.test(userAgent)) {
      return NextResponse.json({
        success: true,
        recorded: 0,
        ignored: "automated",
      });
    }

    const body = await request.json();
    const rawItems: Array<z.infer<typeof singleEventSchema>> =
      body && typeof body === "object" && Array.isArray(body.events)
        ? batchSchema.parse(body).events
        : [singleEventSchema.parse(body)];

    const cleanInputs: AnalyticsEventInput[] = rawItems.map((item) => ({
      type: item.type,
      target: item.target,
      sessionId: item.sessionId,
      device: item.device,
      referrer: sanitizeReferrer(item.referrer),
    }));

    await recordAnalyticsEvents(cleanInputs);
    return NextResponse.json({
      success: true,
      recorded: cleanInputs.length,
    });
  } catch {
    return NextResponse.json({ success: false }, { status: 400 });
  }
}
