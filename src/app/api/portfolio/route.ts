import { NextResponse } from "next/server";
import { getPortfolioContent } from "@/lib/db";
import { toPublicPortfolioPayload } from "@/lib/portfolioPublic";

export async function GET() {
  const db = await getPortfolioContent();
  return NextResponse.json(toPublicPortfolioPayload(db), {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
