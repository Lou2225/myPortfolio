"use client";

import React, { useId, useState } from "react";
import { Link2 } from "lucide-react";
import { FieldWrapper } from "./FieldWrapper";
import { getFieldControlClassName } from "./inputStyles";
import { sanitizeUrlInput, validateUrl } from "@/lib/validation";

export interface UrlFieldProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (sanitizedValue: string) => void;
  onValidChange?: (isValid: boolean) => void;
  placeholder?: string;
  required?: boolean;
  allowRelativePath?: boolean;
  maxLength?: number;
  showIcon?: boolean;
  forceTouched?: boolean;
  rightSlot?: React.ReactNode;
  hint?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
}

export function UrlField({
  id,
  label = "URL",
  value,
  onChange,
  onValidChange,
  placeholder = "https://github.com/...",
  required = false,
  allowRelativePath = true,
  maxLength = 300,
  showIcon = true,
  forceTouched = false,
  rightSlot,
  hint,
  className,
  inputClassName,
  disabled = false,
}: UrlFieldProps) {
  const autoId = useId();
  const fieldId = id || `url-field-${autoId}`;
  const [blurredWithContent, setBlurredWithContent] = useState(false);
  const [focused, setFocused] = useState(false);

  const validation = validateUrl(value, {
    label,
    required,
    allowRelativePath,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const clean = sanitizeUrlInput(e.target.value, maxLength);
    onChange(clean);
    if (blurredWithContent) {
      setBlurredWithContent(false);
    }
    const nextCheck = validateUrl(clean, {
      label,
      required,
      allowRelativePath,
    });
    onValidChange?.(nextCheck.valid);
  };

  const handleFocus = () => {
    setFocused(true);
  };

  const handleBlur = () => {
    setFocused(false);
    setBlurredWithContent(value.trim().length > 0);
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
      <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
        <div className="relative flex-1 min-w-0 sm:min-w-[140px]">
          {showIcon && (
            <Link2 className="w-3.5 h-3.5 text-(--text-muted) absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          )}
          <input
            id={fieldId}
            name={`field_${autoId.replace(/:/g, "")}`}
            type="text"
            inputMode="url"
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
              mono: true,
              className: inputClassName,
            })}
          />
        </div>
        {rightSlot}
      </div>
    </FieldWrapper>
  );
}
