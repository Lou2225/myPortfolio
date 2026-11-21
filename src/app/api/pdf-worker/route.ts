import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

/**
 * Self-hosted same-origin PDF.js legacy worker endpoint.
 * Version-locked to `node_modules/pdfjs-dist` so the in-app multi-page
 * Resume reader works under strict CSP (`worker-src 'self' blob:`) with
 * zero external CDN dependency.
 */
export async function GET() {
  try {
    const workerPath = path.join(
      process.cwd(),
      "node_modules",
      "pdfjs-dist",
      "legacy",
      "build",
      "pdf.worker.min.mjs"
    );
    const buffer = await fs.readFile(workerPath);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "text/javascript; charset=utf-8",
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "PDF worker runtime asset unavailable" },
      { status: 404 }
    );
  }
}
