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
  const isPointerDownBackdropRef = useRef(false);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  const { mounted, visible } = usePresenceTransition(
    open,
    EXIT_DURATION_MS,
    panelRef
  );

  // Lock body scroll and restore on unmount/close
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Focus trap & focus restoration
  useEffect(() => {
    if (!open) return;

    previousActiveElementRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const panel = panelRef.current;
    if (panel) {
      const focusables = panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        panel.focus();
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !closeDisabled) {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "Tab" && panel) {
        const focusables = Array.from(
          panel.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );
        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousActiveElementRef.current?.focus?.();
    };
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
      onPointerDown={(e) => {
        isPointerDownBackdropRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (
          isPointerDownBackdropRef.current &&
          e.target === e.currentTarget &&
          !closeDisabled
        ) {
          onClose();
        }
      }}
      className={cn(
        "fixed inset-0 z-150 flex items-center justify-center p-3 sm:p-4",
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
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{ backfaceVisibility: "hidden" }}
        className={cn(
          "relative z-10 w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[92dvh] flex flex-col rounded-xl bg-(--bg-surface) border border-(--border-strong) shadow-[0_24px_64px_rgba(0,0,0,0.65)] overflow-hidden transition-[transform,opacity] duration-260 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[transform,opacity] outline-none",
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

