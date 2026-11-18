import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { getPortfolioContent } from "@/lib/db";

const RESUME_CSP =
  "default-src 'self'; object-src 'self'; frame-ancestors 'self'";

function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (
    lower === "localhost" ||
    lower === "127.0.0.1" ||
    lower === "0.0.0.0" ||
    lower === "::1" ||
    lower === "[::1]" ||
    lower.endsWith(".local") ||
    lower.endsWith(".internal")
  ) {
    return true;
  }
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(lower)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(lower)) return true;
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(lower)) return true;
  const match172 = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(lower);
  if (match172) {
    const secondOctet = Number(match172[1]);
    if (secondOctet >= 16 && secondOctet <= 31) return true;
  }
  return false;
}

function buildSafeDownloadFilename(fullName?: string): string {
  const slug = (fullName || "Portfolio")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "Portfolio"}-Resume.pdf`;
}

function hasPdfSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d // -
  );
}

function buildPdfResponse(
  body: BodyInit,
  filename: string,
  download: boolean
): NextResponse {
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "Content-Security-Policy": RESUME_CSP,
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
    },
  });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const isDownload = searchParams.get("download") === "1";

    const db = await getPortfolioContent();
    const resumeUrl = (db.profile.resumeUrl || "").trim();
    if (!resumeUrl) {
      return NextResponse.json(
        { error: "No resume document is configured." },
        { status: 404 }
      );
    }

    const filename = buildSafeDownloadFilename(db.profile.fullName);

    // Local uploaded PDF stored under public/uploads/
    if (resumeUrl.startsWith("/uploads/")) {
      const uploadsRoot = path.resolve(process.cwd(), "public", "uploads");
      const rel = resumeUrl.replace(/^\/uploads\/+/, "").split("?")[0];
      const targetPath = path.resolve(uploadsRoot, rel);

      if (
        !targetPath.startsWith(uploadsRoot + path.sep) ||
        !targetPath.toLowerCase().endsWith(".pdf")
      ) {
        return NextResponse.json(
          { error: "Invalid resume asset path." },
          { status: 400 }
        );
      }

      const fileBuffer = await fs.readFile(targetPath);
      if (!hasPdfSignature(fileBuffer)) {
        return NextResponse.json(
          { error: "Configured resume file is not a valid PDF." },
          { status: 415 }
        );
      }

      return buildPdfResponse(new Uint8Array(fileBuffer), filename, isDownload);
    }

    // Remote HTTPS PDF (e.g., Supabase Storage public asset)
    let parsed: URL;
    try {
      parsed = new URL(resumeUrl);
    } catch {
      return NextResponse.json(
        { error: "Invalid resume URL configured." },
        { status: 400 }
      );
    }

    if (parsed.protocol !== "https:" || isBlockedHostname(parsed.hostname)) {
      return NextResponse.json(
        { error: "Unsupported or unsafe resume URL origin." },
        { status: 400 }
      );
    }

    const upstream = await fetch(parsed.toString(), {
      method: "GET",
      signal: AbortSignal.timeout(12000),
      next: { revalidate: 300 },
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: "Unable to load resume document from storage." },
        { status: 502 }
      );
    }

    // Guard against open-redirect hopping to a private network host
    try {
      const finalUrl = new URL(upstream.url);
      if (
        finalUrl.protocol !== "https:" ||
        isBlockedHostname(finalUrl.hostname)
      ) {
        return NextResponse.json(
          { error: "Blocked unsafe upstream redirect." },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: "Invalid upstream resume URL." },
        { status: 400 }
      );
    }

    const contentType = (
      upstream.headers.get("content-type") || ""
    ).toLowerCase();

    if (contentType.includes("application/pdf") && upstream.body) {
      return buildPdfResponse(upstream.body, filename, isDownload);
    }

    const arrayBuf = await upstream.arrayBuffer();
    const bytes = new Uint8Array(arrayBuf);

    if (!hasPdfSignature(bytes)) {
      return NextResponse.json(
        { error: "Configured resume target is not a PDF document." },
        { status: 415 }
      );
    }

    return buildPdfResponse(bytes, filename, isDownload);
  } catch {
    return NextResponse.json(
      { error: "Failed to retrieve resume document." },
      { status: 500 }
    );
  }
}
