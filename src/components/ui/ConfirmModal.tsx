"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, X } from "lucide-react";
import { ModalShell } from "@/components/ui/ModalShell";
import { Button } from "@/components/ui/Button";
import { FIELD_CONTROL_BASE_CLASS } from "@/components/ui/fields/inputStyles";
import { cn } from "@/lib/utils";

export interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "primary" | "danger" | "warning";
  loading?: boolean;
  /** Optional exact confirmation phrase user must type before Confirm button unlocks */
  requireTypedPhrase?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

/**
 * Reusable accessible confirmation dialog matching Obsidian / Editorial Paper
 * Light & Dark design tokens. Supports optional typed confirmation phrases for
 * irreversible operations.
 */
export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "primary",
  loading = false,
  requireTypedPhrase,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const [typedPhrase, setTypedPhrase] = useState("");
  const [cached, setCached] = useState({
    title,
    description,
    confirmLabel,
    cancelLabel,
    variant,
    requireTypedPhrase,
  });

  // Clear typed confirmation input after exit completes (never re-rendering mid-open)
  useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => {
        setTypedPhrase("");
      }, 260);
      return () => clearTimeout(timer);
    }

    if (
      cached.title === title &&
      cached.description === description &&
      cached.confirmLabel === confirmLabel &&
      cached.cancelLabel === cancelLabel &&
      cached.variant === variant &&
      cached.requireTypedPhrase === requireTypedPhrase
    ) {
      return;
    }

    const rafId = requestAnimationFrame(() => {
      setCached({
        title,
        description,
        confirmLabel,
        cancelLabel,
        variant,
        requireTypedPhrase,
      });
    });
    return () => cancelAnimationFrame(rafId);
  }, [
    open,
    title,
    description,
    confirmLabel,
    cancelLabel,
    variant,
    requireTypedPhrase,
    cached,
  ]);

  const activeTitle = open ? title : cached.title || title;
  const activeDesc = open ? description : cached.description || description;
  const activeConfirmLabel = open
    ? confirmLabel
    : cached.confirmLabel || confirmLabel;
  const activeCancelLabel = open
    ? cancelLabel
    : cached.cancelLabel || cancelLabel;
  const activeVariant = open ? variant : cached.variant || variant;
  const activePhrase = open ? requireTypedPhrase : cached.requireTypedPhrase;

  const isDanger = activeVariant === "danger";
  const isWarning = activeVariant === "warning";
  const phraseSatisfied =
    !activePhrase || typedPhrase.trim() === activePhrase.trim();

  return (
    <ModalShell
      open={open}
      onClose={onCancel}
      closeDisabled={loading}
      ariaLabelledBy="confirm-modal-title"
      ariaDescribedBy="confirm-modal-desc"
      maxWidthClassName="max-w-md"
    >
      <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 min-h-0 lou-scrollarea">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "w-10 h-10 rounded-full border flex items-center justify-center shrink-0 mt-0.5",
                isDanger
                  ? "bg-rose-500/15 border-rose-500/35 text-rose-400"
                  : isWarning
                    ? "bg-amber-500/15 border-amber-500/35 text-amber-400"
                    : "bg-brand/15 border-brand/40 text-(--text-accent)"
              )}
            >
              {isDanger || isWarning ? (
                <AlertTriangle className="w-5 h-5" />
              ) : (
                <CheckCircle2 className="w-5 h-5" />
              )}
            </span>

            <div>
              <h3
                id="confirm-modal-title"
                className="font-display text-xl uppercase tracking-tight text-(--text-primary)"
              >
                {activeTitle}
              </h3>
              <p
                id="confirm-modal-desc"
                className="text-xs sm:text-sm text-(--text-secondary) leading-relaxed mt-1.5"
              >
                {activeDesc}
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onCancel}
            disabled={loading}
            aria-label="Close confirmation dialog"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {activePhrase && (
          <div className="p-3.5 rounded-(--radius-control) bg-(--bg-surface-2) border border-rose-500/30 space-y-2">
            <label
              htmlFor="confirm-modal-phrase-input"
              className="text-xs font-mono text-(--text-secondary) block"
            >
              Type{" "}
              <code className="px-1.5 py-0.5 rounded-(--radius-control) bg-(--bg-surface) border border-(--border-subtle) text-rose-400 font-semibold select-all">
                {activePhrase}
              </code>{" "}
              to unlock action:
            </label>
            <input
              id="confirm-modal-phrase-input"
              type="text"
              value={typedPhrase}
              onChange={(e) => setTypedPhrase(e.target.value)}
              disabled={loading}
              autoComplete="off"
              spellCheck={false}
              placeholder={activePhrase}
              className={cn(
                FIELD_CONTROL_BASE_CLASS,
                "px-3 py-2 text-xs font-mono uppercase tracking-wider"
              )}
            />
          </div>
        )}
      </div>

      <div className="px-4 py-3 sm:px-6 sm:py-3.5 bg-(--bg-surface-2) border-t border-(--border-subtle) flex flex-wrap items-center justify-end gap-2 sm:gap-2.5 shrink-0">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={loading}
        >
          {activeCancelLabel}
        </Button>

        <Button
          type="button"
          variant={isDanger ? "danger" : "primary"}
          size="sm"
          onClick={() => void onConfirm()}
          disabled={loading || !phraseSatisfied}
          className={
            isDanger
              ? "keep-white bg-rose-600 hover:bg-rose-500 border-rose-500 text-white hover:text-white hover:shadow-[0_6px_24px_rgba(244,63,94,0.3)]"
              : undefined
          }
        >
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          <span>{activeConfirmLabel}</span>
        </Button>
      </div>
    </ModalShell>
  );
}
