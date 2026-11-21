import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { getVaultDocumentById } from "@/lib/vaultDb";
import { readVaultFile } from "@/lib/vaultStorage";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing document ID." }, { status: 400 });
  }

  const doc = await getVaultDocumentById(id);
  if (!doc) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  const buffer = await readVaultFile(doc.storageKey);
  if (!buffer) {
    return NextResponse.json(
      { error: "Document storage object not found on server." },
      { status: 404 }
    );
  }

  const { searchParams } = new URL(request.url);
  const isDownload = searchParams.get("download") === "1";
  const rangeHeader = request.headers.get("range");

  const safeFilename = doc.originalFilename.replace(/["\r\n]/g, "_");
  const dispositionType = isDownload ? "attachment" : "inline";
  const disposition = `${dispositionType}; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`;

  const commonHeaders: Record<string, string> = {
    "Content-Type": doc.mimeType || "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Content-Disposition": disposition,
    "Cache-Control": "private, no-store, max-age=0, must-revalidate",
    "X-Content-Type-Options": "nosniff",
  };

  const totalLength = buffer.length;

  if (rangeHeader && rangeHeader.startsWith("bytes=")) {
    const rangeSpec = rangeHeader.slice(6).trim();
    const [startStr, endStr] = rangeSpec.split("-");
    let start = parseInt(startStr || "0", 10);
    let end = endStr ? parseInt(endStr, 10) : totalLength - 1;

    if (isNaN(start) || start < 0) start = 0;
    if (isNaN(end) || end >= totalLength) end = totalLength - 1;

    if (start > end) {
      return new NextResponse(null, {
        status: 416,
        headers: {
          "Content-Range": `bytes */${totalLength}`,
        },
      });
    }

    const chunk = buffer.subarray(start, end + 1);
    return new NextResponse(new Uint8Array(chunk), {
      status: 206,
      headers: {
        ...commonHeaders,
        "Content-Range": `bytes ${start}-${end}/${totalLength}`,
        "Content-Length": String(chunk.length),
      },
    });
  }

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      ...commonHeaders,
      "Content-Length": String(totalLength),
    },
  });
}
