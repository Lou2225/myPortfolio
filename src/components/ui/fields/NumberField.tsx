"use client";

import React, { useId, useState } from "react";
import { FieldWrapper } from "./FieldWrapper";
import { getFieldControlClassName } from "./inputStyles";
import { sanitizeNumericInput, validateNumber } from "@/lib/validation";

export interface NumberFieldProps {
  id?: string;
  label: string;
  value: number | string;
  onChange: (numericValue: number) => void;
  onValidChange?: (isValid: boolean) => void;
  min?: number;
  max?: number;
  allowDecimals?: boolean;
  required?: boolean;
  forceTouched?: boolean;
  hint?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
}

export function NumberField({
  id,
  label,
  value,
  onChange,
  onValidChange,
  min,
  max,
  allowDecimals = false,
  required = true,
  forceTouched = false,
  hint,
  className,
  inputClassName,
  disabled = false,
}: NumberFieldProps) {
  const autoId = useId();
  const fieldId = id || `number-field-${autoId}`;
  const [blurred, setBlurred] = useState(false);
  const [focused, setFocused] = useState(false);

  const validation = validateNumber(value, {
    label,
    min,
    max,
    required,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const clean = sanitizeNumericInput(e.target.value, {
      allowDecimals,
      allowNegative: (min ?? 0) < 0,
    });
    const parsed = Number(clean);
    if (!Number.isNaN(parsed)) {
      onChange(parsed);
    }
    if (blurred) {
      setBlurred(false);
    }
    const nextCheck = validateNumber(clean, { label, min, max, required });
    onValidChange?.(nextCheck.valid);
  };

  const handleFocus = () => {
    setFocused(true);
  };

  const handleBlur = () => {
    setFocused(false);
    setBlurred(true);
    let num = Number(value);
    if (Number.isNaN(num)) {
      num = min ?? 0;
    }
    if (min !== undefined && num < min) num = min;
    if (max !== undefined && num > max) num = max;
    if (num !== Number(value)) {
      onChange(num);
    }
    onValidChange?.(true);
  };

  const shouldShowError =
    !focused && !validation.valid && (forceTouched || blurred);

  return (
    <FieldWrapper
      id={fieldId}
      label={label}
      required={required}
      touched={shouldShowError}
      valid={validation.valid}
      error={validation.error}
      hint={hint}
      showCounter={false}
      className={className}
    >
      <input
        id={fieldId}
        name={`field_${autoId.replace(/:/g, "")}`}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        data-lpignore="true"
        data-1p-ignore="true"
        data-form-type="other"
        value={String(value)}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        min={min}
        max={max}
        required={required}
        disabled={disabled}
        aria-invalid={shouldShowError}
        aria-describedby={shouldShowError ? `${fieldId}-error` : undefined}
        className={getFieldControlClassName({
          hasError: shouldShowError,
          mono: true,
          className: inputClassName,
        })}
      />
    </FieldWrapper>
  );
}
