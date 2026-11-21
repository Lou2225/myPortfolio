"use client";

import React from "react";
import Image from "next/image";
import { Certificate } from "@/types/portfolio";
import { StatusPill } from "@/components/ui/StatusPill";
import {
  DisplayHeading,
  BodyText,
  MonoLabel,
} from "@/components/ui/Typography";
import {
  Calendar,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface CertificateCardProps {
  certificate: Certificate;
  onInspect?: (certificate: Certificate) => void;
  className?: string;
}

export function CertificateCard({
  certificate,
  onInspect,
  className,
}: CertificateCardProps) {
  const isPdf =
    certificate.fileType === "pdf" ||
    certificate.fileUrl.toLowerCase().endsWith(".pdf");

  const previewSource = certificate.thumbnailUrl || (!isPdf ? certificate.fileUrl : null);

  const getCategoryVariant = (cat: Certificate["category"]) => {
    switch (cat) {
      case "academic":
        return "warning" as const;
      case "analytics":
        return "accent" as const;
      case "fullstack":
        return "solid" as const;
      case "industry":
      default:
        return "success" as const;
    }
  };

  return (
    <article
      className={cn(
        "group relative flex flex-col justify-between h-full bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-card) overflow-hidden hover:border-(--border-strong) transition-all duration-300 shadow-lg hover:shadow-2xl",
        className
      )}
    >
      {/* Visual Header / Thumbnail Box */}
      <div
        className={cn(
          "relative aspect-16/10 w-full overflow-hidden bg-(--bg-surface-2) border-b border-(--border-subtle) select-none",
          onInspect ? "cursor-pointer" : ""
        )}
        onClick={() => onInspect?.(certificate)}
        role={onInspect ? "button" : undefined}
        tabIndex={onInspect ? 0 : undefined}
        aria-label={onInspect ? `Inspect ${certificate.title}` : undefined}
        onKeyDown={(e) => {
          if (onInspect && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onInspect(certificate);
          }
        }}
      >
        {previewSource ? (
          <Image
            src={previewSource}
            alt={certificate.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover object-top transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-linear-to-br from-brand/5 via-(--bg-surface-2) to-brand/10">
            <span className="w-14 h-14 rounded-2xl bg-brand/10 border border-brand/25 flex items-center justify-center text-(--text-accent) mb-3 shadow-inner">
              <FileText className="w-7 h-7" />
            </span>
            <span className="text-xs font-mono uppercase tracking-widest text-(--text-muted)">
              {isPdf ? "PDF Document" : "Official Credential"}
            </span>
          </div>
        )}

        {/* Hover inspection sheen overlay */}
        <div className="absolute inset-0 bg-(--bg-canvas)/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

        {/* Top Badges */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 pointer-events-none">
          <StatusPill
            label={certificate.category}
            variant={getCategoryVariant(certificate.category)}
            size="xs"
          />
        </div>
      </div>

      {/* Content Details */}
      <div className="p-5 flex flex-col flex-1 justify-between gap-4">
        <div className="flex flex-col gap-2">
          {/* Issuer & Date */}
          <div className="flex items-center justify-between gap-2 text-xs text-(--text-muted)">
            <span className="font-medium text-(--text-secondary) truncate">
              {certificate.issuer}
            </span>
            <span className="inline-flex items-center gap-1 font-mono text-[11px] shrink-0">
              <Calendar className="w-3 h-3" />
              {certificate.issueDate}
            </span>
          </div>

          {/* Title */}
          <DisplayHeading
            as="h3"
            size="sm"
            className="group-hover:text-(--text-accent) transition-colors line-clamp-2"
          >
            {certificate.title}
          </DisplayHeading>

          {/* Description */}
          {certificate.description && (
            <BodyText size="xs" tone="secondary" className="line-clamp-2">
              {certificate.description}
            </BodyText>
          )}

          {/* Credential ID if present */}
          {certificate.credentialId && (
            <div className="mt-1">
              <MonoLabel className="text-[10px] text-(--text-muted) truncate">
                ID: {certificate.credentialId}
              </MonoLabel>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
