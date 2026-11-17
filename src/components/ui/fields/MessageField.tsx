"use client";

import React, { useId, useState } from "react";
import { FieldWrapper } from "./FieldWrapper";
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
  hint,
  className,
  textareaClassName,
  disabled = false,
}: MessageFieldProps) {
  const autoId = useId();
  const fieldId = id || `message-field-${autoId}`;
  const [blurredWithContent, setBlurredWithContent] = useState(false);
  const [focused, setFocused] = useState(false);

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
  );
}
