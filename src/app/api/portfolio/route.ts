import { NextResponse } from "next/server";
import { getPortfolioContent, StorageReadError } from "@/lib/db";
import { toPublicPortfolioPayload } from "@/lib/portfolioPublic";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getPortfolioContent();
    return NextResponse.json(toPublicPortfolioPayload(db), {
      headers: {
        "Cache-Control": "no-store, must-revalidate",
      },
    });
  } catch (err) {
    if (err instanceof StorageReadError) {
      return NextResponse.json(
        { error: "Portfolio data is temporarily unavailable." },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json(
      { error: "Failed to load public portfolio." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
