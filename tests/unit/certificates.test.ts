import { describe, expect, it } from "vitest";
import {
  validateCertificate,
  validateCertificatesDraft,
} from "@/lib/validation";
import { toPublicPortfolioPayload } from "@/lib/portfolioPublic";
import { getDefaultSeedDatabase } from "@/lib/db";
import type { Certificate, PortfolioDatabase } from "@/types/portfolio";

describe("Certificates Validation & Public Showcase Pipeline", () => {
  const sampleCertificate: Certificate = {
    id: "cert-aws-cloud",
    title: "AWS Certified Solutions Architect",
    issuer: "Amazon Web Services",
    issueDate: "2025",
    category: "fullstack",
    credentialId: "AWS-PSA-9912",
    description: "Cloud architecture, high availability, and microservices.",
    skills: ["AWS", "Architecture", "Docker"],
    featured: true,
    published: true,
    order: 1,
    fileType: "image",
    fileUrl: "/images/certificates/aws-cert.webp",
  };

  it("validates a complete, compliant certificate without errors", () => {
    const errors = validateCertificate(sampleCertificate);
    expect(errors).toHaveLength(0);
  });

  it("detects missing title, invalid issuer, and bad URLs", () => {
    const invalidCert: Certificate = {
      ...sampleCertificate,
      title: "A", // too short
      issuer: "", // required
      fileUrl: "",
    };

    const errors = validateCertificate(invalidCert);
    expect(errors.length).toBeGreaterThanOrEqual(3);
    expect(errors.some((e) => e.includes("Title"))).toBe(true);
    expect(errors.some((e) => e.includes("Issuer"))).toBe(true);
    expect(errors.some((e) => e.includes("URL"))).toBe(true);
  });

  it("validates certificates draft array and aggregates errors by certificate id", () => {
    const draft: Certificate[] = [
      sampleCertificate,
      {
        ...sampleCertificate,
        id: "cert-broken",
        title: "",
        issuer: "",
      },
    ];

    const result = validateCertificatesDraft(draft);
    expect(result.valid).toBe(false);
    expect(result.errorsByCert["cert-broken"]).toBeDefined();
    expect(result.errorsByCert["cert-broken"].length).toBeGreaterThan(0);
    expect(result.errorsByCert["cert-aws-cloud"]).toBeUndefined();
  });

  it("permits missing fileUrl when a staged file upload is pending", () => {
    const pendingCert: Certificate = {
      ...sampleCertificate,
      id: "cert-staged-upload",
      fileUrl: "",
    };

    const pendingSet = new Set(["cert-staged-upload"]);
    const result = validateCertificatesDraft([pendingCert], pendingSet);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("only exposes published certificates in public portfolio DTO and omits drafts", () => {
    const seed = getDefaultSeedDatabase();
    const db: PortfolioDatabase = {
      ...seed,
      certificates: [
        {
          ...sampleCertificate,
          id: "public-cert-1",
          title: "Public Accreditation",
          published: true,
        },
        {
          ...sampleCertificate,
          id: "draft-cert-secret",
          title: "Unpublished Private Credential",
          published: false,
        },
      ],
    };

    const publicPayload = toPublicPortfolioPayload(db);
    expect(publicPayload.certificates).toBeDefined();

    const ids = publicPayload.certificates.map((c) => c.id);
    expect(ids).toContain("public-cert-1");
    expect(ids).not.toContain("draft-cert-secret");
  });
});
