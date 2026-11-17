"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
}

const EXIT_DURATION_MS = 240;

/**
 * Reusable GPU-accelerated portal modal with smooth enter & exit transitions
 * (`opacity`, `scale`, and `translate3d`). Keeps DOM mounted until exit animation finishes.
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
}: ModalShellProps) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      let nestedRaf = 0;
      const mountRaf = requestAnimationFrame(() => {
        setMounted(true);
        nestedRaf = requestAnimationFrame(() => {
          setVisible(true);
        });
      });
      return () => {
        cancelAnimationFrame(mountRaf);
        cancelAnimationFrame(nestedRaf);
      };
    }

    const hideRaf = requestAnimationFrame(() => {
      setVisible(false);
    });
    const unmountTimer = setTimeout(() => {
      setMounted(false);
    }, EXIT_DURATION_MS);

    return () => {
      cancelAnimationFrame(hideRaf);
      clearTimeout(unmountTimer);
    };
  }, [open]);

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
        "fixed inset-0 z-120 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm transition-opacity duration-240 ease-out",
        visible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      )}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "w-full rounded-xl bg-(--bg-surface) border border-(--border-strong) shadow-[0_24px_64px_rgba(0,0,0,0.65)] overflow-hidden transition-[transform,opacity] duration-240 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform",
          maxWidthClassName,
          visible
            ? "opacity-100 scale-100 translate-y-0"
            : "opacity-0 scale-95 translate-y-3",
          panelClassName
        )}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

