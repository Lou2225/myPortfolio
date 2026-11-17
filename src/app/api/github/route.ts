import { NextResponse } from "next/server";
import { getPortfolioContent } from "@/lib/db";
import { fetchGitHubSnapshot } from "@/lib/github";
import {
  checkMemoryRateLimit,
  createRateLimitResponse,
  extractNormalizedClientIp,
} from "@/lib/rateLimit";

export async function GET(request: Request) {
  const clientIp = extractNormalizedClientIp(request.headers);
  const rate = checkMemoryRateLimit(`github:${clientIp}`, {
    limit: 60,
    windowMs: 60 * 1000,
  });
  if (!rate.allowed) {
    return createRateLimitResponse(rate.retryAfterSec);
  }

  try {
    const content = await getPortfolioContent();
    const snapshot = await fetchGitHubSnapshot({
      profileGithubUrl: content.profile.contact.github,
    });

    return NextResponse.json(snapshot, {
      headers: {
        "Cache-Control":
          "public, max-age=1800, s-maxage=3600, stale-while-revalidate=7200",
      },
    });
  } catch {
    return NextResponse.json({
      configured: false,
      username: null,
      profileUrl: null,
      publicRepos: 0,
      followers: 0,
      totalStars: 0,
      topLanguages: [],
      recentRepos: [],
      fetchedAt: new Date().toISOString(),
      reason: "github_unavailable",
    });
  }
}
