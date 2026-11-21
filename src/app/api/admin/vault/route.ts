import { NextResponse } from "next/server";
import crypto from "crypto";
import { isAdminAuthenticated, getSessionAndDeviceContext } from "@/lib/auth";
import {
  deleteVaultDocument,
  getVaultDocumentById,
  getVaultStats,
  listVaultDocuments,
  saveVaultDocument,
  updateVaultDocument,
} from "@/lib/vaultDb";
import {
  deleteVaultFile,
  MAX_VAULT_FILE_SIZE_BYTES,
  validateVaultFileHeader,
  writeVaultFile,
} from "@/lib/vaultStorage";
import { VaultCategory, VaultDocument } from "@/types/vault";
import { vaultDocumentMetadataSchema } from "@/lib/validation";
import {
  appendSecurityAudit,
  extractRequestNetworkInfo,
  mutateAdminSecurityStore,
} from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") as VaultCategory | "all" | null;
    const search = searchParams.get("search") || undefined;

    const [documents, stats] = await Promise.all([
      listVaultDocuments({ category: category || "all", search }),
      getVaultStats(),
    ]);

    return NextResponse.json({
      documents,
      stats,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load vault documents." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reqInfo = extractRequestNetworkInfo(request.headers);
  const ctx = await getSessionAndDeviceContext();

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string" || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: "No file provided for upload." },
        { status: 400 }
      );
    }

    if (file.size > MAX_VAULT_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "File exceeds the 25 MB size limit." },
        { status: 400 }
      );
    }

    const rawTitle = (formData.get("title") as string | null)?.trim();
    const rawCategory = (formData.get("category") as string | null)?.trim() || "personal";
    const rawTags = (formData.get("tags") as string | null) || "";
    const rawNotes = (formData.get("notes") as string | null)?.trim();
    const isPinned = formData.get("pinned") === "true";

    const originalFilename = file.name || "document.bin";
    const title = rawTitle || originalFilename.replace(/\.[^/.]+$/, "");

    let parsedTags: string[] = [];
    try {
      if (rawTags.startsWith("[") && rawTags.endsWith("]")) {
        parsedTags = JSON.parse(rawTags);
      } else {
        parsedTags = rawTags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
      }
    } catch {
      parsedTags = [];
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validate magic bytes
    const headerCheck = validateVaultFileHeader(
      buffer,
      file.type || "application/octet-stream",
      originalFilename
    );

    if (!headerCheck.valid) {
      return NextResponse.json(
        { error: headerCheck.error || "Unsupported file format." },
        { status: 400 }
      );
    }

    const docId = crypto.randomUUID();
    const storageKey = await writeVaultFile(docId, buffer, headerCheck.extension);

    const newDoc: VaultDocument = {
      id: docId,
      title,
      originalFilename,
      storageKey,
      fileSize: buffer.length,
      mimeType: headerCheck.detectedMime,
      category: (rawCategory as VaultCategory) || "personal",
      tags: parsedTags.slice(0, 10),
      notes: rawNotes ? rawNotes.slice(0, 1000) : undefined,
      uploadedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pinned: isPinned,
    };

    await saveVaultDocument(newDoc);

    // Audit log
    await mutateAdminSecurityStore((store) =>
      appendSecurityAudit(store, {
        action: "login_success", // general audit
        actorDeviceId: ctx.currentDeviceId || null,
        targetDeviceId: null,
        deviceLabel: reqInfo.userAgent.slice(0, 48),
        ipMasked: reqInfo.ipMasked,
        outcome: "success",
        detail: `Uploaded vault document "${title}" (${(buffer.length / 1024 / 1024).toFixed(2)} MB, category: ${rawCategory}).`,
      })
    );

    return NextResponse.json({
      success: true,
      document: newDoc,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to upload document to vault." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const id = typeof body?.id === "string" ? body.id.trim() : "";
    if (!id) {
      return NextResponse.json({ error: "Document ID is required." }, { status: 400 });
    }

    const validation = vaultDocumentMetadataSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0]?.message || "Invalid document metadata." },
        { status: 400 }
      );
    }

    const updated = await updateVaultDocument(id, validation.data);
    if (!updated) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      document: updated,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update document metadata." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reqInfo = extractRequestNetworkInfo(request.headers);
  const ctx = await getSessionAndDeviceContext();

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id")?.trim();

    if (!id) {
      return NextResponse.json({ error: "Document ID is required." }, { status: 400 });
    }

    const doc = await getVaultDocumentById(id);
    if (!doc) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    await deleteVaultFile(doc.storageKey);
    await deleteVaultDocument(id);

    // Audit log
    await mutateAdminSecurityStore((store) =>
      appendSecurityAudit(store, {
        action: "login_success",
        actorDeviceId: ctx.currentDeviceId || null,
        targetDeviceId: null,
        deviceLabel: reqInfo.userAgent.slice(0, 48),
        ipMasked: reqInfo.ipMasked,
        outcome: "success",
        detail: `Deleted vault document "${doc.title}" (ID: ${id}).`,
      })
    );

    return NextResponse.json({
      success: true,
      deletedId: id,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete vault document." },
      { status: 500 }
    );
  }
}
