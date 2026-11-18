"use client";

import React from "react";
import { cn } from "@/lib/utils";

export interface FieldWrapperProps {
  id: string;
  label: string;
  required?: boolean;
  touched?: boolean;
  valid?: boolean;
  error?: string;
  hint?: string;
  currentLength?: number;
  maxLength?: number;
  showCounter?: boolean;
  /** Optional compact control rendered beside the counter in the field header row. */
  headerAction?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function FieldWrapper({
  id,
  label,
  required = false,
  touched = false,
  valid = true,
  error,
  hint,
  currentLength,
  maxLength,
  showCounter = false,
  headerAction,
  className,
  children,
}: FieldWrapperProps) {
  const showError = touched && !valid && Boolean(error);

  return (
    <div
      data-field-invalid={showError ? "true" : undefined}
      data-field-label={label}
      className={cn("space-y-1.5", className)}
    >
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={id}
          className="text-[11px] font-mono uppercase tracking-[0.18em] text-(--text-secondary) font-medium flex items-center gap-1 select-none min-w-0"
        >
          <span className="truncate">{label}</span>
          {required && <span className="text-(--text-accent) shrink-0">*</span>}
        </label>

        {(headerAction || (showCounter && maxLength !== undefined)) && (
          <div className="flex items-center gap-2 shrink-0">
            {headerAction}
            {showCounter && maxLength !== undefined && (
              <span
                className={cn(
                  "text-[10px] font-mono tabular-nums",
                  (currentLength ?? 0) >= maxLength
                    ? "text-(--text-accent) font-bold"
                    : "text-(--text-muted)"
                )}
              >
                {currentLength ?? 0}/{maxLength}
              </span>
            )}
          </div>
        )}
      </div>

      {children}

      {showError ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="text-[11px] text-(--text-accent) font-normal pt-0.5 transition-opacity duration-200"
        >
          {error}
        </p>
      ) : hint ? (
        <p
          id={`${id}-hint`}
          className="text-[11px] text-(--text-muted) pt-0.5"
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}
