"use client";

import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { usePresenceTransition } from "@/lib/usePresenceTransition";
import { cn } from "@/lib/utils";

export interface ModalShellProps {
  open: boolean;
  onClose: () => void;
  closeDisabled?: boolean;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  maxWidthClassName?: string;
  children: React.ReactNode;
  panelClassName?: string;
  backdropClassName?: string;
}

const EXIT_DURATION_MS = 260;

/**
 * Reusable GPU-accelerated portal modal with two-stage post-commit reveal,
 * an isolated compositor scrim (eliminating Chromium backdrop-blur fade flashes),
 * and smooth enter/exit transitions (`opacity`, `scale`, `translate3d`).
 */
export function ModalShell({
  open,
  onClose,
  closeDisabled = false,
  ariaLabelledBy,
  ariaDescribedBy,
  maxWidthClassName = "max-w-md",
  children,
  panelClassName,
  backdropClassName,
}: ModalShellProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { mounted, visible } = usePresenceTransition(
    open,
    EXIT_DURATION_MS,
    panelRef
  );

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !closeDisabled) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, closeDisabled, onClose]);

  if (!mounted || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      data-lenis-prevent
      onClick={() => {
        if (!closeDisabled) onClose();
      }}
      className={cn(
        "fixed inset-0 z-120 flex items-center justify-center p-3 sm:p-4",
        visible ? "pointer-events-auto" : "pointer-events-none",
        backdropClassName
      )}
    >
      {/* Isolated GPU-promoted scrim avoids Chromium backdrop-filter opacity flash */}
      <div
        aria-hidden="true"
        style={{ transform: "translateZ(0)" }}
        className={cn(
          "fixed inset-0 bg-black/72 backdrop-blur-xs transition-opacity duration-240 ease-out will-change-[opacity]",
          visible ? "opacity-100" : "opacity-0"
        )}
      />

      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        style={{ backfaceVisibility: "hidden" }}
        className={cn(
          "relative z-10 w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[92dvh] flex flex-col rounded-xl bg-(--bg-surface) border border-(--border-strong) shadow-[0_24px_64px_rgba(0,0,0,0.65)] overflow-hidden transition-[transform,opacity] duration-260 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[transform,opacity]",
          maxWidthClassName,
          visible
            ? "opacity-100 scale-100 translate-y-0"
            : "opacity-0 scale-[0.97] translate-y-2.5",
          panelClassName
        )}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

