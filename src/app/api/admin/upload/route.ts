import crypto from "crypto";
import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { isAdminAuthenticated } from "@/lib/auth";
import { getStorageMode, buildSupabaseHeaders } from "@/lib/db";
import {
  checkMemoryRateLimit,
  createRateLimitResponse,
  extractNormalizedClientIp,
} from "@/lib/rateLimit";
import { verifyUploadMagicBytes } from "@/lib/uploadSecurity";
import {
  ALLOWED_AUDIO_EXTENSIONS,
  ALLOWED_AUDIO_MIME_TYPES,
  ALLOWED_CURSOR_EXTENSIONS,
  ALLOWED_CURSOR_MIME_TYPES,
  ALLOWED_IMAGE_EXTENSIONS,
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_AUDIO_UPLOAD_BYTES,
  MAX_CURSOR_UPLOAD_BYTES,
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_PDF_UPLOAD_BYTES,
} from "@/lib/validation";

const IMAGE_UPLOAD_FOLDERS = new Set([
  "hero",
  "monogram",
  "projects",
  "scares",
  "general",
]);

const CANONICAL_MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".cur": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
};

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = extractNormalizedClientIp(request.headers);
  const rate = checkMemoryRateLimit(`admin-upload:${ip}`, {
    limit: 30,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return createRateLimitResponse(
      rate.retryAfterSec,
      "Too many uploads. Please wait a moment and try again."
    );
  }

  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: "Invalid multipart form-data request." },
        { status: 400 }
      );
    }

    const rawFile = formData.get("file");
    const rawFolderEntry = formData.get("folder");
    const rawFolder = (
      typeof rawFolderEntry === "string" ? rawFolderEntry : "general"
    ).replace(/[^a-zA-Z0-9_-]/g, "");
    const folder = rawFolder || "general";

    if (!(rawFile instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }
    const file = rawFile;

    const lowerName = file.name.toLowerCase();
    const ext = path.extname(lowerName);
    const mime = (file.type || "").toLowerCase().trim();

    if (!mime) {
      return NextResponse.json(
        { error: "Uploaded file is missing a valid Content-Type MIME header." },
        { status: 400 }
      );
    }

    if (folder === "resume") {
      if (ext !== ".pdf" || mime !== "application/pdf") {
        return NextResponse.json(
          { error: "Only PDF (.pdf) documents are permitted for resume uploads." },
          { status: 400 }
        );
      }
      if (file.size <= 0 || file.size > MAX_PDF_UPLOAD_BYTES) {
        return NextResponse.json(
          { error: "PDF file must be between 1 byte and 10 MB." },
          { status: 400 }
        );
      }
    } else if (folder === "cursors") {
      const validExt = (ALLOWED_CURSOR_EXTENSIONS as readonly string[]).includes(ext);
      const validMime =
        (ALLOWED_CURSOR_MIME_TYPES as readonly string[]).includes(mime) &&
        (mime !== "application/octet-stream" || ext === ".cur");

      if (!validExt || !validMime) {
        return NextResponse.json(
          {
            error:
              "Only cursor files (.png, .cur, .webp, .ico) are permitted in cursors.",
          },
          { status: 400 }
        );
      }
      if (file.size <= 0 || file.size > MAX_CURSOR_UPLOAD_BYTES) {
        return NextResponse.json(
          { error: "Cursor file must be between 1 byte and 512 KB." },
          { status: 400 }
        );
      }
    } else if (folder === "audio") {
      const validExt = (ALLOWED_AUDIO_EXTENSIONS as readonly string[]).includes(ext);
      const validMime = (ALLOWED_AUDIO_MIME_TYPES as readonly string[]).includes(mime);

      if (!validExt || !validMime) {
        return NextResponse.json(
          {
            error:
              "Only short audio files (.mp3, .wav, .ogg) are permitted in audio.",
          },
          { status: 400 }
        );
      }
      if (file.size <= 0 || file.size > MAX_AUDIO_UPLOAD_BYTES) {
        return NextResponse.json(
          { error: "Audio clip must be between 1 byte and 2.5 MB." },
          { status: 400 }
        );
      }
    } else if (folder === "certificates") {
      const isPdf = ext === ".pdf" && mime === "application/pdf";
      const isImg =
        (ALLOWED_IMAGE_EXTENSIONS as readonly string[]).includes(ext) &&
        (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mime);

      if (!isPdf && !isImg) {
        return NextResponse.json(
          {
            error:
              "Certificates accept PDF documents (.pdf) or image files (.png, .jpg, .webp, .avif).",
          },
          { status: 400 }
        );
      }
      const maxBytes = isPdf ? MAX_PDF_UPLOAD_BYTES : MAX_IMAGE_UPLOAD_BYTES;
      if (file.size <= 0 || file.size > maxBytes) {
        return NextResponse.json(
          {
            error: `Certificate file must be between 1 byte and ${
              isPdf ? "10 MB" : "5 MB"
            }.`,
          },
          { status: 400 }
        );
      }
    } else if (IMAGE_UPLOAD_FOLDERS.has(folder)) {
      const validExt = (ALLOWED_IMAGE_EXTENSIONS as readonly string[]).includes(ext);
      const validMime = (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mime);

      if (!validExt || !validMime) {
        return NextResponse.json(
          {
            error:
              "Only raster image files (.png, .jpg, .webp, .avif, .ico) are permitted.",
          },
          { status: 400 }
        );
      }
      if (file.size <= 0 || file.size > MAX_IMAGE_UPLOAD_BYTES) {
        return NextResponse.json(
          { error: "Image file must be between 1 byte and 5 MB." },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { error: "Invalid upload folder destination." },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const magicCheck = verifyUploadMagicBytes(buffer, ext);
    if (!magicCheck.valid) {
      return NextResponse.json(
        { error: magicCheck.error || "Uploaded binary signature rejected." },
        { status: 400 }
      );
    }

    const safeExt = ext || (folder === "resume" ? ".pdf" : ".png");
    const effectiveMime = CANONICAL_MIME_BY_EXT[safeExt] || "application/octet-stream";
    const baseName = (
      path
        .basename(file.name, path.extname(file.name))
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "-") || "asset"
    ).slice(0, 48);
    const fileName = `${baseName}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}${safeExt}`;

    // 1. If Supabase is configured, upload to Supabase Storage bucket
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (getStorageMode() === "supabase" && supabaseUrl && supabaseKey) {
      const bucket = (process.env.SUPABASE_STORAGE_BUCKET || "myPortfolio").trim();
      const encodedStoragePath = `${encodeURIComponent(folder)}/${encodeURIComponent(fileName)}`;
      const encodedBucket = encodeURIComponent(bucket);
      const uploadRes = await fetch(
        `${supabaseUrl}/storage/v1/object/${encodedBucket}/${encodedStoragePath}`,
        {
          method: "POST",
          headers: buildSupabaseHeaders(supabaseKey, {
            "Content-Type": effectiveMime,
            "x-upsert": "true",
          }),
          body: buffer,
          signal: AbortSignal.timeout(15000),
        }
      );

      if (uploadRes.ok) {
        const publicUrl = `${supabaseUrl}/storage/v1/object/public/${encodedBucket}/${encodedStoragePath}`;
        return NextResponse.json({ success: true, url: publicUrl });
      }

      const detail = (await uploadRes.text().catch(() => "")).slice(0, 180);
      return NextResponse.json(
        {
          error: `Supabase Storage upload failed (HTTP ${uploadRes.status}${detail ? `: ${detail}` : ""}).`,
        },
        { status: 502 }
      );
    }

    // 2. Local filesystem storage inside public/uploads/<folder>/
    const uploadDir = path.join(process.cwd(), "public", "uploads", folder);
    await fs.mkdir(uploadDir, { recursive: true });
    const filePath = path.join(uploadDir, fileName);
    await fs.writeFile(filePath, buffer);

    return NextResponse.json({
      success: true,
      url: `/uploads/${folder}/${fileName}`,
    });
  } catch {
    return NextResponse.json(
      { error: "File upload failed." },
      { status: 500 }
    );
  }
}

