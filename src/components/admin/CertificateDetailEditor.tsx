"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Certificate, CertificateCategory } from "@/types/portfolio";
import { Button } from "@/components/ui/Button";
import { IconActionButton } from "@/components/ui/ActionButtons";
import {
  FieldWrapper,
  MessageField,
  SubjectField,
  TextField,
} from "@/components/ui/fields";
import {
  ArrowLeft,
  Award,
  Eye,
  EyeOff,
  FileText,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface CertificateDetailEditorProps {
  certificate: Certificate;
  index: number;
  totalCount: number;
  errors?: string[];
  isDirty?: boolean;
  pendingFile: File | null;
  onBack: () => void;
  onDelete: () => void;
  onUpdateField: <K extends keyof Certificate>(
    field: K,
    value: Certificate[K]
  ) => void;
  onPendingFileChange: (file: File | null) => void;
}

const CATEGORIES: { id: CertificateCategory; label: string; shortLabel: string }[] = [
  { id: "academic", label: "Academic Honors & Degrees", shortLabel: "Academic" },
  { id: "analytics", label: "Business Analytics & Data", shortLabel: "Analytics" },
  { id: "fullstack", label: "Full-Stack Architecture", shortLabel: "Full-Stack" },
  { id: "industry", label: "Industry Certifications", shortLabel: "Industry" },
];

export function CertificateDetailEditor({
  certificate,
  index,
  totalCount,
  errors = [],
  isDirty = false,
  pendingFile,
  onBack,
  onDelete,
  onUpdateField,
  onPendingFileChange,
}: CertificateDetailEditorProps) {
  const isPublished = certificate.published !== false;
  const [stagedPreviewUrl, setStagedPreviewUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setUploadError("Document must not exceed 10 MB.");
      return;
    }

    setUploadError(null);
    onPendingFileChange(file);

    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setStagedPreviewUrl(url);
    } else {
      setStagedPreviewUrl(null);
    }
  };

  const isPdf =
    pendingFile?.type === "application/pdf" ||
    certificate.fileUrl.toLowerCase().endsWith(".pdf");

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Action Navigation Bar matching ProjectDetailEditor */}
      <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-3 sm:px-5 sm:py-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="h-9 px-2.5 sm:px-3 text-xs font-mono gap-1.5 text-(--text-muted) hover:text-(--text-primary)"
            aria-label="Back to certificates list"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Back to List</span>
          </Button>

          <span className="text-(--border-subtle) hidden sm:inline">|</span>

          <div className="flex items-center gap-2 min-w-0">
            <span className="text-(--text-accent) font-mono text-xs font-semibold tabular-nums">
              #{String(index + 1).padStart(2, "0")} / {String(totalCount).padStart(2, "0")}
            </span>
            <span className="text-(--text-primary) font-semibold text-xs sm:text-sm truncate max-w-40 sm:max-w-xs md:max-w-md">
              {certificate.title || "Untitled Credential"}
            </span>
            {isDirty && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"
                title="Unsaved document changes"
              />
            )}
          </div>
        </div>

        {/* Action Controls matching Projects CRUD */}
        <div className="flex items-center gap-2">
          {/* Live / Draft Toggle Button */}
          <Button
            type="button"
            variant={isPublished ? "secondary" : "outline"}
            size="sm"
            onClick={() => onUpdateField("published", !isPublished)}
            className={cn(
              "h-9 px-3 font-mono text-[11px]",
              isPublished
                ? "border-emerald-500/35 bg-emerald-500/10 text-(--text-success) hover:text-(--text-success) hover:border-emerald-500/60"
                : "text-(--text-muted)"
            )}
            aria-label={
              isPublished
                ? `Set ${certificate.title} to Draft`
                : `Publish ${certificate.title} Live`
            }
          >
            {isPublished ? (
              <>
                <Eye className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Live</span>
              </>
            ) : (
              <>
                <EyeOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Draft</span>
              </>
            )}
          </Button>

          {/* Featured Spotlight Star */}
          <IconActionButton
            label={
              certificate.featured
                ? `Unmark as featured`
                : `Mark as featured`
            }
            size="compact"
            onClick={() => onUpdateField("featured", !certificate.featured)}
            className={
              certificate.featured
                ? "border-brand/55 bg-(--bg-badge-highlight) text-(--text-accent)"
                : undefined
            }
            icon={
              <Star
                className={cn(
                  "w-3.5 h-3.5",
                  certificate.featured && "fill-current"
                )}
                aria-hidden="true"
              />
            }
          />

          {/* Delete Button */}
          <IconActionButton
            label="Delete Credential"
            size="compact"
            onClick={onDelete}
            className="hover:border-rose-500/50 hover:bg-rose-500/10 hover:text-rose-400"
            icon={<Trash2 className="w-3.5 h-3.5" aria-hidden="true" />}
          />
        </div>
      </div>

      {/* Validation Errors Notice */}
      {errors.length > 0 && (
        <div className="p-3.5 rounded-(--radius-card) bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-mono space-y-1">
          <span className="font-semibold uppercase tracking-wider block">
            {errors.length} Required {errors.length === 1 ? "Field Issue" : "Field Issues"}:
          </span>
          <ul className="list-disc list-inside space-y-0.5">
            {errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Section 1: Identity & Issuing Authority */}
      <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-5 sm:p-7 space-y-5 shadow-xs">
        <div className="flex items-center gap-2 pb-3 border-b border-(--border-subtle)">
          <Award className="w-4 h-4 text-(--text-accent)" />
          <h4 className="font-mono text-xs uppercase tracking-wider font-semibold text-(--text-primary)">
            01 · Identity & Classification
          </h4>
        </div>

        <div className="space-y-4">
          <SubjectField
            label="Certificate Title"
            value={certificate.title}
            onChange={(val) => onUpdateField("title", val)}
            placeholder="e.g. Google Advanced Data Analytics Professional Certificate"
            required
            maxLength={120}
          />

          {/* Category Pill Radio Selector */}
          <FieldWrapper id="cert-category-select" label="Credential Category" required>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              {CATEGORIES.map((cat) => {
                const isSelected = certificate.category === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => onUpdateField("category", cat.id)}
                    className={cn(
                      "p-3 rounded-(--radius-control) border text-left transition-all cursor-pointer font-mono select-none",
                      isSelected
                        ? "border-brand bg-(--bg-badge-highlight) text-(--text-primary) ring-1 ring-brand/50 shadow-xs"
                        : "border-(--border-subtle) bg-(--bg-surface-2) text-(--text-secondary) hover:border-(--border-strong) hover:text-(--text-primary)"
                    )}
                  >
                    <span className="text-xs font-semibold block truncate">
                      {cat.shortLabel}
                    </span>
                    <span className="text-[10px] text-(--text-muted) block truncate mt-0.5">
                      {cat.id}
                    </span>
                  </button>
                );
              })}
            </div>
          </FieldWrapper>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <TextField
              label="Issuing Organization"
              value={certificate.issuer}
              onChange={(val) => onUpdateField("issuer", val)}
              placeholder="e.g. Coursera / Google / LSPU"
              required
              maxLength={80}
            />
            <TextField
              label="Issue Date"
              value={certificate.issueDate}
              onChange={(val) => onUpdateField("issueDate", val)}
              placeholder="e.g. 2025-06"
              required
              maxLength={40}
            />
            <TextField
              label="Expiry Date"
              value={certificate.expiryDate || ""}
              onChange={(val) => onUpdateField("expiryDate", val || undefined)}
              placeholder="e.g. No Expiration"
              maxLength={40}
            />
          </div>
        </div>
      </div>

      {/* Section 2: Credential Details & Description */}
      <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-5 sm:p-7 space-y-5 shadow-xs">
        <div className="flex items-center gap-2 pb-3 border-b border-(--border-subtle)">
          <FileText className="w-4 h-4 text-(--text-accent)" />
          <h4 className="font-mono text-xs uppercase tracking-wider font-semibold text-(--text-primary)">
            02 · Credential Details
          </h4>
        </div>

        <div className="space-y-4">
          <TextField
            label="Credential ID"
            value={certificate.credentialId || ""}
            onChange={(val) => onUpdateField("credentialId", val || undefined)}
            placeholder="e.g. COURSERA-BA-994821"
            maxLength={80}
          />

          <MessageField
            label="Description & Key Competencies"
            value={certificate.description || ""}
            onChange={(val) => onUpdateField("description", val || undefined)}
            placeholder="Highlights of demonstrated competencies, curriculum, and academic review outcomes..."
            maxLength={280}
            rows={3}
          />
        </div>
      </div>

      {/* Section 3: Official Document & Image Preview */}
      <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) p-5 sm:p-7 space-y-5 shadow-xs">
        <div className="flex items-center gap-2 pb-3 border-b border-(--border-subtle)">
          <FileText className="w-4 h-4 text-(--text-accent)" />
          <h4 className="font-mono text-xs uppercase tracking-wider font-semibold text-(--text-primary)">
            03 · Document & Preview File
          </h4>
        </div>

        {uploadError && (
          <div className="p-3 text-xs rounded-(--radius-control) bg-rose-500/12 text-rose-400 border border-rose-500/30 font-mono">
            {uploadError}
          </div>
        )}

        <div className="flex flex-col md:flex-row items-center gap-6 p-5 rounded-(--radius-card) border border-dashed border-(--border-subtle) bg-(--bg-surface-2)/50">
          {/* Visual Preview Box */}
          <div className="relative w-40 h-28 sm:w-48 sm:h-32 rounded-lg bg-(--bg-surface) border border-(--border-subtle) flex items-center justify-center overflow-hidden shrink-0 shadow-md">
            {stagedPreviewUrl ? (
              <Image
                src={stagedPreviewUrl}
                alt="Staged Preview"
                fill
                className="object-cover"
                unoptimized
              />
            ) : certificate.fileUrl && !isPdf ? (
              <Image
                src={certificate.fileUrl}
                alt="Current Credential"
                fill
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-center p-3 text-(--text-muted)">
                <FileText className="w-8 h-8 mb-1.5 text-brand" />
                <span className="text-[10px] font-mono uppercase tracking-wider">
                  {isPdf ? "PDF Document" : "No File"}
                </span>
              </div>
            )}
          </div>

          {/* File Meta & Actions */}
          <div className="flex-1 text-center md:text-left space-y-2 min-w-0">
            <div>
              <p className="text-sm font-semibold text-(--text-primary) truncate">
                {pendingFile
                  ? pendingFile.name
                  : certificate.fileUrl
                  ? certificate.fileUrl.split("/").pop()
                  : "No certificate file attached"}
              </p>
              <p className="text-xs font-mono text-(--text-muted) mt-0.5">
                {pendingFile
                  ? `${(pendingFile.size / 1024).toFixed(1)} KB staged for upload`
                  : isPdf
                  ? "Official PDF credential document"
                  : "High-resolution image scan"}
              </p>
            </div>

            <label className="inline-flex items-center gap-2 px-4 py-2 rounded-(--radius-control) bg-(--bg-surface) border border-(--border-subtle) hover:border-brand text-xs font-mono uppercase tracking-wider text-(--text-primary) cursor-pointer transition-colors shadow-xs">
              <Upload className="w-3.5 h-3.5 text-brand" />
              <span>Choose Document / Image</span>
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.avif"
                onChange={handleFileChange}
                className="sr-only"
              />
            </label>
            <p className="text-[10px] font-mono text-(--text-muted)">
              Supported formats: .pdf, .png, .jpg, .webp, .avif (up to 10 MB)
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Navigation & Save Reminder Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-(--radius-card) border border-(--border-subtle) bg-(--bg-surface) shadow-xs">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onBack}
          className="h-10 px-4 text-xs font-mono gap-1.5 w-full sm:w-auto"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Done Editing</span>
        </Button>

        <p className="text-[11px] font-mono text-(--text-muted) text-center sm:text-right">
          Edits are staged in workspace draft. Click <span className="text-(--text-accent) font-semibold">Save</span> in the floating Brand Portal to publish.
        </p>
      </div>
    </div>
  );
}
