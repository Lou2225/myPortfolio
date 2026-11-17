"use client";

import React, { useId, useState } from "react";
import { Tag } from "lucide-react";
import { FieldWrapper } from "./FieldWrapper";
import { getFieldControlClassName } from "./inputStyles";
import { sanitizeTextInput, validateSubject } from "@/lib/inputValidation";

export interface SubjectFieldProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (sanitizedValue: string) => void;
  onValidChange?: (isValid: boolean) => void;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  showCounter?: boolean;
  showIcon?: boolean;
  forceTouched?: boolean;
  hint?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
}

export function SubjectField({
  id,
  label = "Subject",
  value,
  onChange,
  onValidChange,
  placeholder = "Full-Stack Role / Project Inquiry",
  required = true,
  minLength = 3,
  maxLength = 120,
  showCounter = true,
  showIcon = true,
  forceTouched = false,
  hint,
  className,
  inputClassName,
  disabled = false,
}: SubjectFieldProps) {
  const autoId = useId();
  const fieldId = id || `subject-field-${autoId}`;
  const [blurredWithContent, setBlurredWithContent] = useState(false);
  const [focused, setFocused] = useState(false);

  const validation = validateSubject(value, {
    label,
    minLength,
    maxLength,
    required,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const clean = sanitizeTextInput(e.target.value, {
      maxLength,
      multiline: false,
    });
    onChange(clean);
    if (blurredWithContent) {
      setBlurredWithContent(false);
    }
    const nextCheck = validateSubject(clean, {
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
      <div className="relative">
        {showIcon && (
          <Tag className="w-4 h-4 text-(--text-muted) absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        )}
        <input
          id={fieldId}
          name={`field_${autoId.replace(/:/g, "")}`}
          type="text"
          autoComplete="off"
          autoCorrect="off"
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
