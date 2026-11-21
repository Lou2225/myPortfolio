import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mockResumeState = {
  resumeUrl: "",
  fullName: "Lou Diamond Lava Valdellon",
};

vi.mock("@/lib/db", () => ({
  getPortfolioContent: vi.fn(async () => ({
    profile: {
      resumeUrl: mockResumeState.resumeUrl,
      fullName: mockResumeState.fullName,
    },
  })),
}));

import { GET as getResume, HEAD as headResume } from "@/app/api/resume/route";
import { GET as getPdfWorker } from "@/app/api/pdf-worker/route";
import {
  buildSafeResumeFilename,
  parseByteRangeHeader,
  resolveResumeTargets,
} from "@/lib/resumeCache";

/**
 * Generates a minimal, spec-compliant multi-page PDF binary (N pages)
 * with accurate byte-offset xref table so PDF.js parses every page cleanly.
 */
function buildValidMultiPagePdf(pageCount: number): Uint8Array {
  const objects: string[] = [];
  // Object 1: Catalog
  objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  // Object 2: Pages tree referencing objects 3..(2 + pageCount)
  const kids = Array.from({ length: pageCount }, (_, i) => `${i + 3} 0 R`).join(
    " "
  );
  objects.push(
    `2 0 obj\n<< /Type /Pages /Kids [ ${kids} ] /Count ${pageCount} >>\nendobj\n`
  );
  // Objects 3..(2 + pageCount): Individual A4 pages
  for (let i = 0; i < pageCount; i++) {
    const objId = i + 3;
    objects.push(
      `${objId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [ 0 0 595 842 ] >>\nendobj\n`
    );
  }

  let body = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(body, "utf8"));
    body += obj;
  }

  const xrefOffset = Buffer.byteLength(body, "utf8");
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i++) {
    body += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  body += `startxref\n${xrefOffset}\n%%EOF\n`;

  return new Uint8Array(Buffer.from(body, "utf8"));
}

describe("Multi-Page Resume Viewer, Byte-Range Proxy & PDF.js Worker", () => {
  const createdTempFiles: string[] = [];
  let tempUploadDir = "";

  beforeAll(() => {
    tempUploadDir = path.join(
      process.cwd(),
      "public",
      "uploads",
      `vitest-resume-${Date.now()}`
    );
    fs.mkdirSync(tempUploadDir, { recursive: true });
  });

  afterAll(() => {
    for (const f of createdTempFiles) {
      fs.rmSync(f, { force: true });
    }
    if (tempUploadDir) {
      fs.rmSync(tempUploadDir, { recursive: true, force: true });
    }
    // Remove empty public/uploads dir only if created during test
    const uploadsRoot = path.join(process.cwd(), "public", "uploads");
    try {
      if (fs.existsSync(uploadsRoot) && fs.readdirSync(uploadsRoot).length === 0) {
        fs.rmdirSync(uploadsRoot);
      }
    } catch {
      // Ignore cleanup race
    }
    // Keep os imported reference clean
    void os.tmpdir;
  });

  it("resolves direct Supabase/local PDF targets and Google Drive preview targets cleanly", () => {
    const direct = resolveResumeTargets(
      "https://demo.supabase.co/storage/v1/object/public/myPortfolio/resume/cv.pdf"
    );
    expect(direct.isGoogleDrive).toBe(false);
    expect(direct.apiSrc).toMatch(/^\/api\/resume\?v=/);
    expect(direct.downloadHref).toMatch(/^\/api\/resume\?download=1&v=/);
    expect(direct.openTabHref).toBe(direct.apiSrc);

    const drive = resolveResumeTargets(
      "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQr/view?usp=sharing"
    );
    expect(drive.isGoogleDrive).toBe(true);
    expect(drive.iframeSrc).toBe(
      "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQr/preview"
    );
    expect(drive.downloadHref).toBe(
      "https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMnOpQr"
    );

    expect(buildSafeResumeFilename("Lou Diamond Lava Valdellon")).toBe(
      "Lou-Diamond-Lava-Valdellon-Resume.pdf"
    );
  });

  it("parses RFC 7233 HTTP Range headers accurately", () => {
    expect(parseByteRangeHeader(null, 1000)).toBe("none");
    expect(parseByteRangeHeader("bytes=0-99", 1000)).toEqual({
      start: 0,
      end: 99,
    });
    expect(parseByteRangeHeader("bytes=500-", 1000)).toEqual({
      start: 500,
      end: 999,
    });
    expect(parseByteRangeHeader("bytes=-128", 1000)).toEqual({
      start: 872,
      end: 999,
    });
    expect(parseByteRangeHeader("bytes=0-5000", 1000)).toEqual({
      start: 0,
      end: 999,
    });
    expect(parseByteRangeHeader("bytes=1000-1200", 1000)).toBe("invalid");
    expect(parseByteRangeHeader("bytes=500-200", 1000)).toBe("invalid");
    expect(parseByteRangeHeader("items=0-10", 1000)).toBe("invalid");
  });

  it("serves a 3-page PDF with Content-Length, Accept-Ranges, 206 Range slicing, HEAD, and parses all 3 pages via pdfjs-dist", async () => {
    const threePagePdf = buildValidMultiPagePdf(3);
    const folderName = path.basename(tempUploadDir);
    const localPdfPath = path.join(tempUploadDir, "three-page-cv.pdf");
    fs.writeFileSync(localPdfPath, threePagePdf);
    createdTempFiles.push(localPdfPath);

    mockResumeState.resumeUrl = `/uploads/${folderName}/three-page-cv.pdf`;

    // 1. Full GET returns 200 with Content-Length & Accept-Ranges: bytes
    const fullRes = await getResume(
      new Request("https://louvaldellon.vercel.app/api/resume")
    );
    expect(fullRes.status).toBe(200);
    expect(fullRes.headers.get("content-type")).toBe("application/pdf");
    expect(fullRes.headers.get("accept-ranges")).toBe("bytes");
    expect(fullRes.headers.get("content-length")).toBe(
      String(threePagePdf.byteLength)
    );
    expect(fullRes.headers.get("content-disposition")).toContain("inline;");

    const servedBytes = new Uint8Array(await fullRes.arrayBuffer());
    expect(servedBytes.byteLength).toBe(threePagePdf.byteLength);

    // 2. Verify pdfjs-dist parses ALL 3 pages from the served bytes
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(servedBytes.slice(0)),
      useSystemFonts: true,
      disableFontFace: true,
    });
    const doc = await loadingTask.promise;
    try {
      expect(doc.numPages).toBe(3);
      for (let p = 1; p <= 3; p++) {
        const page = await doc.getPage(p);
        const vp = page.getViewport({ scale: 1 });
        expect(vp.width).toBe(595);
        expect(vp.height).toBe(842);
      }
    } finally {
      await loadingTask.destroy();
    }

    // 3. Partial Range request returns 206 Partial Content
    const rangeRes = await getResume(
      new Request("https://louvaldellon.vercel.app/api/resume", {
        headers: { Range: "bytes=0-31" },
      })
    );
    expect(rangeRes.status).toBe(206);
    expect(rangeRes.headers.get("content-range")).toBe(
      `bytes 0-31/${threePagePdf.byteLength}`
    );
    expect(rangeRes.headers.get("content-length")).toBe("32");
    const sliceBytes = new Uint8Array(await rangeRes.arrayBuffer());
    expect(sliceBytes.byteLength).toBe(32);

    // 4. Out-of-bounds Range returns 416
    const badRangeRes = await getResume(
      new Request("https://louvaldellon.vercel.app/api/resume", {
        headers: { Range: "bytes=999999-1000000" },
      })
    );
    expect(badRangeRes.status).toBe(416);

    // 5. Attachment download mode sets Content-Disposition: attachment
    const dlRes = await getResume(
      new Request("https://louvaldellon.vercel.app/api/resume?download=1")
    );
    expect(dlRes.status).toBe(200);
    expect(dlRes.headers.get("content-disposition")).toContain("attachment;");

    // 6. HEAD returns 200 with Content-Length and empty body
    const headRes = await headResume(
      new Request("https://louvaldellon.vercel.app/api/resume", {
        method: "HEAD",
      })
    );
    expect(headRes.status).toBe(200);
    expect(headRes.headers.get("content-length")).toBe(
      String(threePagePdf.byteLength)
    );
    expect((await headRes.arrayBuffer()).byteLength).toBe(0);
  });

  it("rejects spoofed non-PDF files with 415 and missing resumeUrl with 404", async () => {
    const folderName = path.basename(tempUploadDir);
    const fakePdfPath = path.join(tempUploadDir, "fake.pdf");
    fs.writeFileSync(fakePdfPath, "<html>not a pdf</html>");
    createdTempFiles.push(fakePdfPath);

    mockResumeState.resumeUrl = `/uploads/${folderName}/fake.pdf`;
    const spoofRes = await getResume(
      new Request("https://louvaldellon.vercel.app/api/resume")
    );
    expect(spoofRes.status).toBe(415);

    mockResumeState.resumeUrl = "";
    const missingRes = await getResume(
      new Request("https://louvaldellon.vercel.app/api/resume")
    );
    expect(missingRes.status).toBe(404);
  });

  it("serves the self-hosted PDF.js legacy ES module worker from /api/pdf-worker", async () => {
    const res = await getPdfWorker();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(
      "text/javascript; charset=utf-8"
    );
    const len = Number(res.headers.get("content-length") || "0");
    expect(len).toBeGreaterThan(100_000);
  });
});
