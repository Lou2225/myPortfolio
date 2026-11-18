"use client";

import React, { useId, useState } from "react";
import { FieldWrapper } from "./FieldWrapper";
import { getFieldControlClassName } from "./inputStyles";
import {
  sanitizeTextInput,
  validateSubject,
  ValidationResult,
} from "@/lib/validation";

export interface TextFieldProps {
  id?: string;
  label: string;
  value: string;
  onChange: (sanitizedValue: string) => void;
  onValidChange?: (isValid: boolean) => void;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  showCounter?: boolean;
  uppercase?: boolean;
  mono?: boolean;
  forceTouched?: boolean;
  leftSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
  /** Optional wrapper around only the input control box (e.g. mobile SwipeRevealRow matching field height). */
  renderInputControl?: (controlNode: React.ReactNode) => React.ReactNode;
  /** When true, wraps `rightSlot` onto a full-width row below the input on `< sm` viewports. */
  wrapRightSlotOnMobile?: boolean;
  hint?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  trimOnBlur?: boolean;
  validate?: (value: string) => ValidationResult;
}

export function TextField({
  id,
  label,
  value,
  onChange,
  onValidChange,
  placeholder,
  required = true,
  minLength = 1,
  maxLength = 160,
  showCounter = false,
  uppercase = false,
  mono = false,
  forceTouched = false,
  leftSlot,
  rightSlot,
  renderInputControl,
  wrapRightSlotOnMobile = false,
  hint,
  className,
  inputClassName,
  disabled = false,
  trimOnBlur = true,
  validate,
}: TextFieldProps) {
  const autoId = useId();
  const fieldId = id || `text-field-${autoId}`;
  const [blurredWithContent, setBlurredWithContent] = useState(false);
  const [focused, setFocused] = useState(false);

  const runValidate = (val: string): ValidationResult =>
    validate
      ? validate(val)
      : validateSubject(val, {
          label,
          minLength,
          maxLength,
          required,
        });

  const validation = runValidate(value);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let clean = sanitizeTextInput(e.target.value, {
      maxLength,
      multiline: false,
    });
    if (uppercase) {
      clean = clean.toUpperCase();
    }
    onChange(clean);
    if (blurredWithContent) {
      setBlurredWithContent(false);
    }
    const nextCheck = runValidate(clean);
    onValidChange?.(nextCheck.valid);
  };

  const handleFocus = () => {
    setFocused(true);
  };

  const handleBlur = () => {
    setFocused(false);
    const normalized = trimOnBlur ? value.trim() : value;
    if (normalized !== value) {
      onChange(normalized);
    }
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
      showCounter={showCounter}
      className={className}
    >
      <div
        className={
          wrapRightSlotOnMobile
            ? "flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
            : "flex items-center gap-2"
        }
      >
        {(() => {
          const inputControl = (
            <div className="relative flex-1 min-w-0">
              {leftSlot && (
                <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none select-none">
                  {leftSlot}
                </span>
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
                  hasLeftIcon: Boolean(leftSlot),
                  mono,
                  className: uppercase
                    ? `uppercase ${inputClassName || ""}`.trim()
                    : inputClassName,
                })}
              />
            </div>
          );

          return renderInputControl
            ? renderInputControl(inputControl)
            : inputControl;
        })()}
        {rightSlot}
      </div>
    </FieldWrapper>
  );
}
