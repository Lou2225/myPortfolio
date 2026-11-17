"use client";

import React, { useRef, useState } from "react";
import { FieldWrapper } from "./FieldWrapper";
import { cn } from "@/lib/utils";

export interface OtpCodeFieldProps {
  id: string;
  label?: string;
  length?: number;
  value: string;
  onChange: (code: string) => void;
  required?: boolean;
  disabled?: boolean;
  forceTouched?: boolean;
  hint?: string;
  error?: string;
  onComplete?: (code: string) => void;
  className?: string;
}

/**
 * Reusable segmented numeric OTP code input built on shared `FieldWrapper` and `theme-input` styles.
 * Supports keyboard auto-advance, full-code paste (`123456` / `123 456`), arrow navigation, and backspace.
 */
export function OtpCodeField({
  id,
  label = "6-Digit Verification Code",
  length = 6,
  value,
  onChange,
  required = true,
  disabled = false,
  forceTouched = false,
  hint,
  error: externalError,
  onComplete,
  className,
}: OtpCodeFieldProps) {
  const [touched, setTouched] = useState(false);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const normalized = value.replace(/\D/g, "").slice(0, length);
  const digits = Array.from({ length }, (_, i) => normalized[i] || "");

  const isTouched = touched || forceTouched;
  const valid = normalized.length === length;
  const resolvedError =
    externalError ||
    (isTouched && !valid
      ? `Enter the exact ${length}-digit code displayed on your desktop.`
      : undefined);

  const emitCode = (nextDigits: string[]) => {
    const joined = nextDigits.join("").slice(0, length);
    onChange(joined);
    if (joined.length === length && onComplete) {
      onComplete(joined);
    }
  };

  const handleDigitChange = (idx: number, raw: string) => {
    const clean = raw.replace(/\D/g, "");
    if (!clean) {
      const copy = [...digits];
      copy[idx] = "";
      emitCode(copy);
      return;
    }

    if (clean.length > 1) {
      // Handle autofill or multi-char paste directly into any cell
      const copy = [...digits];
      for (let offset = 0; offset < clean.length && idx + offset < length; offset++) {
        copy[idx + offset] = clean[offset];
      }
      emitCode(copy);
      const nextFocus = Math.min(idx + clean.length, length - 1);
      inputRefs.current[nextFocus]?.focus();
      return;
    }

    const copy = [...digits];
    copy[idx] = clean;
    emitCode(copy);
    if (idx < length - 1) {
      inputRefs.current[idx + 1]?.focus();
    }
  };

  const handleKeyDown = (
    idx: number,
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === "Backspace") {
      if (!digits[idx] && idx > 0) {
        e.preventDefault();
        const copy = [...digits];
        copy[idx - 1] = "";
        emitCode(copy);
        inputRefs.current[idx - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && idx > 0) {
      e.preventDefault();
      inputRefs.current[idx - 1]?.focus();
    } else if (e.key === "ArrowRight" && idx < length - 1) {
      e.preventDefault();
      inputRefs.current[idx + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!pasted) return;
    e.preventDefault();
    const slice = pasted.slice(0, length);
    const nextDigits = Array.from({ length }, (_, i) => slice[i] || "");
    emitCode(nextDigits);
    const focusIdx = Math.min(slice.length, length - 1);
    inputRefs.current[focusIdx]?.focus();
  };

  return (
    <FieldWrapper
      id={`${id}-0`}
      label={label}
      required={required}
      touched={isTouched}
      valid={valid && !externalError}
      error={resolvedError}
      hint={hint}
      currentLength={normalized.length}
      maxLength={length}
      showCounter
      className={className}
    >
      <div
        role="group"
        aria-label={label}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setTouched(true);
          }
        }}
        className="grid grid-cols-6 gap-2 sm:gap-2.5"
      >
        {digits.map((digit, idx) => (
          <input
            key={idx}
            ref={(el) => {
              inputRefs.current[idx] = el;
            }}
            id={`${id}-${idx}`}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete={idx === 0 ? "one-time-code" : "off"}
            maxLength={length}
            value={digit}
            disabled={disabled}
            aria-label={`Verification digit ${idx + 1} of ${length}`}
            onChange={(e) => handleDigitChange(idx, e.target.value)}
            onKeyDown={(e) => handleKeyDown(idx, e)}
            onPaste={handlePaste}
            onFocus={(e) => e.currentTarget.select()}
            className={cn(
              "theme-input h-12 sm:h-13 w-full text-center font-mono text-lg sm:text-xl font-bold rounded-(--radius-control) bg-[#17171b] border text-(--text-primary) focus:outline-none transition-colors disabled:opacity-50",
              resolvedError
                ? "border-brand/75 focus:border-brand"
                : digit
                  ? "border-(--border-strong) focus:border-brand"
                  : "border-(--border-subtle) focus:border-brand"
            )}
          />
        ))}
      </div>
    </FieldWrapper>
  );
}

