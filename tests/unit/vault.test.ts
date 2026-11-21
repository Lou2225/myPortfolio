import { describe, expect, it } from "vitest";
import {
  validateVaultFileHeader,
  writeVaultFile,
  readVaultFile,
  deleteVaultFile,
} from "@/lib/vaultStorage";
import { vaultDocumentMetadataSchema } from "@/lib/validation";
import {
  saveVaultDocument,
  getVaultDocumentById,
  updateVaultDocument,
  deleteVaultDocument,
  getVaultStats,
} from "@/lib/vaultDb";
import { GET as vaultGetHandler } from "@/app/api/admin/vault/route";
import type { VaultDocument } from "@/types/vault";

describe("Private Document Vault Integrity & Security Pipeline", () => {
  describe("Magic-Byte Header Validation", () => {
    it("recognizes valid PDF magic bytes (%PDF-)", () => {
      const pdfBuffer = Buffer.from("%PDF-1.7\nSample PDF payload content");
      const res = validateVaultFileHeader(pdfBuffer, "application/pdf", "tor.pdf");
      expect(res.valid).toBe(true);
      expect(res.detectedMime).toBe("application/pdf");
      expect(res.extension).toBe("pdf");
    });

    it("recognizes valid PNG magic bytes", () => {
      const pngHeader = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
      ]);
      const res = validateVaultFileHeader(pngHeader, "image/png", "diploma.png");
      expect(res.valid).toBe(true);
      expect(res.detectedMime).toBe("image/png");
      expect(res.extension).toBe("png");
    });

    it("recognizes valid JPEG magic bytes", () => {
      const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      const res = validateVaultFileHeader(jpegHeader, "image/jpeg", "nbi.jpg");
      expect(res.valid).toBe(true);
      expect(res.detectedMime).toBe("image/jpeg");
      expect(res.extension).toBe("jpg");
    });

    it("recognizes valid WEBP magic bytes", () => {
      const webpHeader = Buffer.concat([
        Buffer.from("RIFF", "ascii"),
        Buffer.from([0x20, 0x00, 0x00, 0x00]),
        Buffer.from("WEBP", "ascii"),
      ]);
      const res = validateVaultFileHeader(webpHeader, "image/webp", "scan.webp");
      expect(res.valid).toBe(true);
      expect(res.detectedMime).toBe("image/webp");
      expect(res.extension).toBe("webp");
    });

    it("rejects disguised executable binaries and unknown bytes", () => {
      // Windows PE EXE (MZ header)
      const exeBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);
      const res = validateVaultFileHeader(exeBuffer, "application/octet-stream", "malware.exe");
      expect(res.valid).toBe(false);
      expect(res.error).toBeDefined();
    });

    it("rejects files under 4 bytes", () => {
      const tinyBuffer = Buffer.from([0x01, 0x02]);
      const res = validateVaultFileHeader(tinyBuffer, "application/pdf", "short.pdf");
      expect(res.valid).toBe(false);
      expect(res.error).toContain("too small");
    });
  });

  describe("Metadata Validation Schema", () => {
    it("validates valid vault metadata", () => {
      const result = vaultDocumentMetadataSchema.safeParse({
        title: "Official Transcript of Records",
        category: "academic",
        tags: ["TOR", "University", "Graduation"],
        notes: "Certified true copy sealed by registrar.",
        pinned: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe("Official Transcript of Records");
        expect(result.data.category).toBe("academic");
        expect(result.data.pinned).toBe(true);
      }
    });

    it("rejects too short title or invalid category", () => {
      const result = vaultDocumentMetadataSchema.safeParse({
        title: "A",
        category: "unknown_category_xyz",
      });

      expect(result.success).toBe(false);
    });
  });

  describe("Storage Operations & File Persistence", () => {
    it("writes, reads, and deletes vault binary files on local disk safely", async () => {
      const testContent = Buffer.from("SECURE_VAULT_CONTENT_CONFIDENTIAL_12345");
      const storageKey = await writeVaultFile("test-file-id-123", testContent, "txt");
      expect(storageKey).toBeDefined();

      const readBack = await readVaultFile(storageKey);
      expect(readBack).not.toBeNull();
      expect(readBack?.toString()).toBe("SECURE_VAULT_CONTENT_CONFIDENTIAL_12345");

      const deleted = await deleteVaultFile(storageKey);
      expect(deleted).toBe(true);

      const readAfterDelete = await readVaultFile(storageKey);
      expect(readAfterDelete).toBeNull();
    });
  });

  describe("Vault Database Record CRUD", () => {
    const testDocId = "test-doc-unit-" + Date.now();
    const testDoc: VaultDocument = {
      id: testDocId,
      title: "Unit Test Passport Clearance",
      originalFilename: "passport_scan.pdf",
      storageKey: "unit-test-key-" + Date.now(),
      fileSize: 1024,
      mimeType: "application/pdf",
      fileType: "pdf",
      category: "government",
      tags: ["ID", "Gov"],
      notes: "Unit test record",
      uploadedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pinned: false,
    };

    it("saves, retrieves, updates, and deletes document records", async () => {
      await saveVaultDocument(testDoc);

      const fetched = await getVaultDocumentById(testDocId);
      expect(fetched).not.toBeNull();
      expect(fetched?.title).toBe(testDoc.title);

      const updated = await updateVaultDocument(testDocId, {
        title: "Updated Passport Clearance",
        pinned: true,
      });
      expect(updated?.title).toBe("Updated Passport Clearance");
      expect(updated?.pinned).toBe(true);

      const stats = await getVaultStats();
      expect(stats.totalFiles).toBeGreaterThanOrEqual(1);

      const deleted = await deleteVaultDocument(testDocId);
      expect(deleted?.id).toBe(testDocId);

      const fetchAfterDelete = await getVaultDocumentById(testDocId);
      expect(fetchAfterDelete).toBeNull();
    });
  });

  describe("Authentication Gate Protection", () => {
    it("locks out unauthenticated requests with HTTP 401", async () => {
      const req = new Request("http://localhost:3000/api/admin/vault");
      const res = await vaultGetHandler(req);
      expect(res.status).toBe(401);

      const body = await res.json();
      expect(body.error).toBe("Unauthorized");
    });
  });
});
