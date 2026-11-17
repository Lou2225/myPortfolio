"use client";

import React, { useId, useState } from "react";
import { Mail } from "lucide-react";
import { FieldWrapper } from "./FieldWrapper";
import { getFieldControlClassName } from "./inputStyles";
import { sanitizeEmailInput, validateEmail } from "@/lib/inputValidation";

export interface EmailFieldProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (sanitizedValue: string) => void;
  onValidChange?: (isValid: boolean) => void;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  showIcon?: boolean;
  forceTouched?: boolean;
  hint?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
}

export function EmailField({
  id,
  label = "Email Address",
  value,
  onChange,
  onValidChange,
  placeholder = "jane@company.com",
  required = true,
  maxLength = 120,
  showIcon = true,
  forceTouched = false,
  hint,
  className,
  inputClassName,
  disabled = false,
}: EmailFieldProps) {
  const autoId = useId();
  const fieldId = id || `email-field-${autoId}`;
  const [blurredWithContent, setBlurredWithContent] = useState(false);
  const [focused, setFocused] = useState(false);

  const validation = validateEmail(value, { label, required });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const clean = sanitizeEmailInput(e.target.value, maxLength);
    onChange(clean);
    if (blurredWithContent) {
      setBlurredWithContent(false);
    }
    const nextCheck = validateEmail(clean, { label, required });
    onValidChange?.(nextCheck.valid);
  };

  const handleFocus = () => {
    setFocused(true);
  };

  const handleBlur = () => {
    setFocused(false);
    const clean = sanitizeEmailInput(value, maxLength);
    if (clean !== value) {
      onChange(clean);
    }
    setBlurredWithContent(clean.length > 0);
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
      showCounter={false}
      className={className}
    >
      <div className="relative">
        {showIcon && (
          <Mail className="w-4 h-4 text-(--text-muted) absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        )}
        <input
          id={fieldId}
          name={`field_${autoId.replace(/:/g, "")}`}
          type="text"
          inputMode="email"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-lpignore="true"
          data-1p-ignore="true"
          data-form-type="other"
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
          className={getFieldControlClassName({
            hasError: shouldShowError,
            hasLeftIcon: showIcon,
            className: inputClassName,
          })}
        />
      </div>
    </FieldWrapper>
  );
}
