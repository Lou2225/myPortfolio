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
  const [localRaw, setLocalRaw] = useState<string | null>(null);

  const displayString =
    focused && localRaw !== null ? localRaw : String(value ?? "");

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
    setLocalRaw(clean);

    if (clean === "" || clean === "-" || clean === "." || clean === "-.") {
      onValidChange?.(!required);
      return;
    }

    const parsed = Number(clean);
    if (!Number.isNaN(parsed)) {
      onChange(parsed);
      const nextCheck = validateNumber(parsed, { label, min, max, required });
      onValidChange?.(nextCheck.valid);
    }
    if (blurred) {
      setBlurred(false);
    }
  };

  const handleFocus = () => {
    setFocused(true);
    setLocalRaw(String(value ?? ""));
  };

  const handleBlur = () => {
    setFocused(false);
    setBlurred(true);
    let num = localRaw !== null ? Number(localRaw) : Number(value);
    setLocalRaw(null);

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
        value={displayString}
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
