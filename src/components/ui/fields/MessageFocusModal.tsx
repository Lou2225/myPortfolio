"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { Check, FileText, X } from "lucide-react";
import { ModalShell } from "@/components/ui/ModalShell";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { sanitizeTextInput, validateMessage } from "@/lib/inputValidation";
import { cn } from "@/lib/utils";

export interface MessageFocusModalProps {
  open: boolean;
  label: string;
  initialValue: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  hint?: string;
  onApply: (sanitizedValue: string) => void;
  onCancel: () => void;
}

/**
 * Distraction-free writing overlay for mobile `MessageField` inputs.
 * Prevents soft-keyboard viewport squeezing while preserving real-time
 * sanitization, validation feedback, and character counters.
 */
export function MessageFocusModal({
  open,
  label,
  initialValue,
  placeholder,
  required = true,
  minLength = 10,
  maxLength = 2000,
  hint,
  onApply,
  onCancel,
}: MessageFocusModalProps) {
  const titleId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [draftText, setDraftText] = useState(initialValue);

  useEffect(() => {
    if (!open) return;
    const rafId = requestAnimationFrame(() => {
      setDraftText(initialValue);
      const timer = setTimeout(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus({ preventScroll: true });
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }, 120);
      return () => clearTimeout(timer);
    });
    return () => cancelAnimationFrame(rafId);
  }, [open, initialValue]);

  const validation = validateMessage(draftText, {
    label,
    minLength,
    maxLength,
    required,
  });

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const clean = sanitizeTextInput(e.target.value, {
      maxLength,
      multiline: true,
    });
    setDraftText(clean);
  };

  const handleApply = () => {
    const clean = sanitizeTextInput(draftText.trim(), {
      maxLength,
      multiline: true,
    });
    onApply(clean);
  };

  return (
    <ModalShell
      open={open}
      onClose={onCancel}
      ariaLabelledBy={titleId}
      maxWidthClassName="max-w-xl"
      panelClassName="bg-(--bg-surface) border border-(--border-strong) rounded-(--radius-card) shadow-[0_24px_60px_rgba(0,0,0,0.65)] max-h-[92dvh] flex flex-col overflow-hidden"
    >
      {/* Modal Header */}
      <div className="px-4 py-3.5 border-b border-(--border-subtle) bg-(--bg-surface-2)/75 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-(--radius-control) bg-(--bg-badge-highlight) border border-brand/35 flex items-center justify-center shrink-0 text-(--text-accent)">
            <FileText className="w-4 h-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-(--text-muted) block">
              Focus Text Editor
            </span>
            <h3
              id={titleId}
              className="text-sm font-semibold text-(--text-primary) truncate"
            >
              {label}
            </h3>
          </div>
        </div>

        <button
          type="button"
          onClick={onCancel}
          aria-label={`Close ${label} focus editor`}
          className="h-8 w-8 rounded-full border border-(--border-subtle) bg-(--bg-surface) hover:border-brand text-(--text-muted) hover:text-(--text-primary) inline-flex items-center justify-center transition-colors shrink-0 cursor-pointer"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Generous Distraction-Free Writing Area */}
      <div className="p-4 flex-1 flex flex-col gap-3 min-h-0 overflow-y-auto lou-scrollarea">
        <div className="flex items-center justify-between gap-2">
          <StatusPill
            label={validation.valid ? "Valid" : "Needs attention"}
            variant={validation.valid ? "success" : "warning"}
            size="xs"
          />
          <span
            className={cn(
              "text-xs font-mono tabular-nums",
              draftText.length >= maxLength
                ? "text-(--text-accent) font-bold"
                : "text-(--text-muted)"
            )}
          >
            {draftText.length}/{maxLength}
          </span>
        </div>

        <textarea
          ref={textareaRef}
          value={draftText}
          onChange={handleChange}
          placeholder={placeholder}
          maxLength={maxLength}
          aria-label={label}
          className={cn(
            "theme-input lou-scrollarea w-full flex-1 min-h-[14rem] sm:min-h-[18rem] bg-[#17171b] border rounded-(--radius-control) px-3.5 py-3 text-sm leading-relaxed text-(--text-primary) placeholder:text-(--text-muted) focus:outline-none transition-colors resize-none overflow-y-auto",
            validation.valid
              ? "border-(--border-subtle) focus:border-brand"
              : "border-brand/60 focus:border-brand"
          )}
        />

        {!validation.valid && validation.error ? (
          <p className="text-[11px] text-(--text-accent)">{validation.error}</p>
        ) : hint ? (
          <p className="text-[11px] text-(--text-muted)">{hint}</p>
        ) : null}
      </div>

      {/* Bottom Sticky CTA Bar */}
      <div className="px-4 py-3 border-t border-(--border-subtle) bg-(--bg-surface-2)/60 flex items-center justify-end gap-2.5 shrink-0">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          className="h-10 px-4 font-mono"
        >
          <span>Cancel</span>
        </Button>

        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={handleApply}
          className="h-10 px-5 font-mono"
        >
          <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>Done</span>
        </Button>
      </div>
    </ModalShell>
  );
}
