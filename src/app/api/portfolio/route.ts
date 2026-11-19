import { NextResponse } from "next/server";
import { getPortfolioContent } from "@/lib/db";
import { toPublicPortfolioPayload } from "@/lib/portfolioPublic";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await getPortfolioContent();
  return NextResponse.json(toPublicPortfolioPayload(db), {
    headers: {
      "Cache-Control": "no-store, must-revalidate",
    },
  });
}
