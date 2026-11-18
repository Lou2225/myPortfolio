"use client";

import React, { useId, useState } from "react";
import { Maximize2 } from "lucide-react";
import { FieldWrapper } from "./FieldWrapper";
import { MessageFocusModal } from "./MessageFocusModal";
import { sanitizeTextInput, validateMessage } from "@/lib/inputValidation";
import { cn } from "@/lib/utils";

export interface MessageFieldProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (sanitizedValue: string) => void;
  onValidChange?: (isValid: boolean) => void;
  placeholder?: string;
  rows?: number;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  showCounter?: boolean;
  forceTouched?: boolean;
  /** Show a mobile-only `Focus` expand trigger in the label row for fullscreen distraction-free writing. */
  expandableOnMobile?: boolean;
  hint?: string;
  className?: string;
  textareaClassName?: string;
  disabled?: boolean;
}

export function MessageField({
  id,
  label = "Message",
  value,
  onChange,
  onValidChange,
  placeholder = "Tell me about your team, system requirements, or project timeline...",
  rows = 4,
  required = true,
  minLength = 10,
  maxLength = 2000,
  showCounter = true,
  forceTouched = false,
  expandableOnMobile = false,
  hint,
  className,
  textareaClassName,
  disabled = false,
}: MessageFieldProps) {
  const autoId = useId();
  const fieldId = id || `message-field-${autoId}`;
  const [blurredWithContent, setBlurredWithContent] = useState(false);
  const [focused, setFocused] = useState(false);
  const [focusModalOpen, setFocusModalOpen] = useState(false);

  const validation = validateMessage(value, {
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
    onChange(clean);
    if (blurredWithContent) {
      setBlurredWithContent(false);
    }
    const nextCheck = validateMessage(clean, {
      label,
      minLength,
      maxLength,
      required,
    });
    onValidChange?.(nextCheck.valid);
  };

  const handleFocus = () => {
    setFocused(true);
  };

  const handleBlur = () => {
    setFocused(false);
    const trimmed = value.trim();
    if (trimmed !== value) {
      onChange(trimmed);
    }
    setBlurredWithContent(trimmed.length > 0);
    onValidChange?.(validation.valid);
  };

  const shouldShowError =
    !focused &&
    !validation.valid &&
    (forceTouched || (blurredWithContent && value.trim().length > 0));

  return (
    <>
      <FieldWrapper
        id={fieldId}
        label={label}
        required={required}
        touched={shouldShowError}
        valid={validation.valid}
        error={validation.error}
        hint={hint}
        currentLength={value.length}
        maxLength={maxLength}
        showCounter={showCounter}
        className={className}
        headerAction={
          expandableOnMobile && !disabled ? (
            <button
              type="button"
              onClick={() => setFocusModalOpen(true)}
              aria-label={`Open distraction-free focus editor for ${label}`}
              className="md:hidden inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-(--bg-badge-highlight) border border-brand/35 hover:border-brand text-[10px] font-mono uppercase tracking-wider text-(--text-accent) transition-colors cursor-pointer"
            >
              <Maximize2 className="w-2.5 h-2.5" aria-hidden="true" />
              <span>Focus</span>
            </button>
          ) : undefined
        }
      >
        <textarea
          id={fieldId}
          name={`field_${autoId.replace(/:/g, "")}`}
          rows={rows}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          data-lpignore="true"
          data-1p-ignore="true"
          data-form-type="other"
          data-lenis-prevent
          value={value}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          required={required}
          maxLength={maxLength}
          disabled={disabled}
          aria-invalid={shouldShowError}
          aria-describedby={shouldShowError ? `${fieldId}-error` : undefined}
          className={cn(
            "theme-input lou-scrollarea w-full bg-[#17171b] border rounded-(--radius-control) px-3.5 py-2.5 text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:outline-none transition-colors resize-none overflow-y-auto disabled:opacity-50",
            shouldShowError
              ? "border-brand/70 focus:border-brand"
              : "border-(--border-subtle) focus:border-brand",
            textareaClassName
          )}
        />
      </FieldWrapper>

      {expandableOnMobile && (
        <MessageFocusModal
          open={focusModalOpen}
          label={label}
          initialValue={value}
          placeholder={placeholder}
          required={required}
          minLength={minLength}
          maxLength={maxLength}
          hint={hint}
          onCancel={() => setFocusModalOpen(false)}
          onApply={(nextValue) => {
            onChange(nextValue);
            setBlurredWithContent(nextValue.length > 0);
            const nextCheck = validateMessage(nextValue, {
              label,
              minLength,
              maxLength,
              required,
            });
            onValidChange?.(nextCheck.valid);
            setFocusModalOpen(false);
          }}
        />
      )}
    </>
  );
}
