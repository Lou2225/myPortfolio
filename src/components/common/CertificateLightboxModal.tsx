"use client";

import React, { useRef, useState } from "react";
import Image from "next/image";
import {
  Award,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  X,
} from "lucide-react";
import { Certificate } from "@/types/portfolio";
import { ModalShell } from "@/components/ui/ModalShell";
import { PdfDocumentCanvas } from "@/components/common/PdfDocumentCanvas";

interface CertificateLightboxModalProps {
  certificate: Certificate | null;
  isOpen: boolean;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}

export function CertificateLightboxModal({
  certificate,
  isOpen,
  onClose,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
}: CertificateLightboxModalProps) {
  const [copiedId, setCopiedId] = useState(false);
  const [zoomPercent] = useState(100);
  const [isFullscreen] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  if (!certificate) return null;

  const isPdf =
    certificate.fileType === "pdf" ||
    certificate.fileUrl.toLowerCase().endsWith(".pdf");

  const handleCopyCredentialId = async () => {
    if (!certificate.credentialId) return;
    try {
      await navigator.clipboard.writeText(certificate.credentialId);
      setCopiedId(true);
      window.setTimeout(() => setCopiedId(false), 2000);
    } catch {
      // Ignore clipboard write failures
    }
  };

  const getCategoryColor = (cat: Certificate["category"]) => {
    switch (cat) {
      case "academic":
        return "bg-amber-500/10 text-amber-400 border-amber-500/30";
      case "analytics":
        return "bg-cyan-500/10 text-cyan-400 border-cyan-500/30";
      case "fullstack":
        return "bg-brand/10 text-(--text-accent) border-brand/30";
      case "industry":
      default:
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
    }
  };

  return (
    <ModalShell
      open={isOpen}
      onClose={onClose}
      maxWidthClassName="max-w-4xl"
      ariaLabelledBy="certificate-modal-title"
    >
      <div className="flex flex-col max-h-[90vh] overflow-hidden bg-(--bg-surface) rounded-(--radius-card) border border-(--border-subtle)">
        {/* Header Bar */}
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-(--border-subtle) bg-(--bg-surface)/80 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-full bg-brand/15 border border-brand/35 flex items-center justify-center shrink-0 text-(--text-accent)">
              <Award className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full border ${getCategoryColor(
                    certificate.category
                  )}`}
                >
                  {certificate.category}
                </span>
              </div>
              <h2
                id="certificate-modal-title"
                className="font-display text-lg sm:text-xl uppercase tracking-tight text-(--text-primary) truncate mt-0.5"
              >
                {certificate.title}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {hasPrev && onPrev && (
              <button
                type="button"
                onClick={onPrev}
                aria-label="Previous certificate"
                className="w-8.5 h-8.5 rounded-(--radius-control) border border-(--border-subtle) bg-(--bg-canvas) hover:border-brand text-(--text-secondary) hover:text-(--text-primary) flex items-center justify-center transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            {hasNext && onNext && (
              <button
                type="button"
                onClick={onNext}
                aria-label="Next certificate"
                className="w-8.5 h-8.5 rounded-(--radius-control) border border-(--border-subtle) bg-(--bg-canvas) hover:border-brand text-(--text-secondary) hover:text-(--text-primary) flex items-center justify-center transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close certificate lightbox"
              className="w-8.5 h-8.5 rounded-(--radius-control) border border-(--border-subtle) bg-(--bg-canvas) hover:border-brand text-(--text-secondary) hover:text-(--text-primary) flex items-center justify-center transition-colors cursor-pointer ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-5">
          {/* Main Visual Display */}
          <div className="relative w-full rounded-(--radius-card) border border-(--border-subtle) bg-black/40 overflow-hidden flex items-center justify-center min-h-70 sm:min-h-105">
            {isPdf ? (
              <div className="w-full flex justify-center py-4">
                <div ref={scrollContainerRef} className="w-full max-h-[60vh] overflow-y-auto">
                <PdfDocumentCanvas
                  open={isOpen}
                  pdfUrl={certificate.fileUrl}
                  fullName={certificate.title}
                  zoomPercent={zoomPercent}
                  isFullscreen={isFullscreen}
                  scrollContainerRef={scrollContainerRef}
                  onDocumentLoaded={() => {}}
                  onFirstPageRendered={() => {}}
                  onActivePageChange={() => {}}
                  onLoadError={() => {}}
                />
              </div>
              </div>
            ) : (
              <div className="relative w-full h-80 sm:h-120">
                <Image
                  src={certificate.fileUrl}
                  alt={certificate.title}
                  fill
                  sizes="(max-width: 1024px) 100vw, 860px"
                  className="object-contain"
                  priority
                />
              </div>
            )}
          </div>

          {/* Metadata Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-(--radius-card) border border-(--border-subtle) bg-(--bg-surface)/40">
            <div className="flex flex-col gap-2">
              <div>
                <span className="text-[11px] font-mono uppercase tracking-wider text-(--text-muted)">
                  Issuing Organization
                </span>
                <p className="text-sm font-medium text-(--text-primary)">
                  {certificate.issuer}
                </p>
              </div>

              <div className="flex items-center gap-4 text-xs font-mono text-(--text-secondary) pt-1">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-(--text-accent)" />
                  Issued: {certificate.issueDate}
                </span>
                {certificate.expiryDate && (
                  <span className="text-(--text-muted)">
                    Expires: {certificate.expiryDate}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:items-end justify-between">
              {certificate.credentialId && (
                <div className="flex flex-col sm:items-end">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-(--text-muted)">
                    Credential ID
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyCredentialId}
                    className="inline-flex items-center gap-1.5 font-mono text-xs text-(--text-primary) hover:text-(--text-accent) transition-colors mt-0.5 cursor-pointer"
                    title="Click to copy credential ID"
                  >
                    <span>{certificate.credentialId}</span>
                    {copiedId ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-(--text-muted)" />
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Related Skills Tags */}
          {certificate.skills.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-mono uppercase tracking-widest text-(--text-muted)">
                Demonstrated Competencies
              </span>
              <div className="flex flex-wrap gap-1.5">
                {certificate.skills.map((skill) => (
                  <span
                    key={skill}
                    className="px-2.5 py-1 rounded-full text-xs font-mono bg-(--bg-canvas) border border-(--border-subtle) text-(--text-secondary)"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
