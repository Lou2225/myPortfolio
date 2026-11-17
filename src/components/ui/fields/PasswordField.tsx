"use client";

import React, { useId, useState } from "react";
import { KeyRound, Eye, EyeOff } from "lucide-react";
import { FieldWrapper } from "./FieldWrapper";
import { getFieldControlClassName } from "./inputStyles";
import { sanitizePasswordInput, validatePassword } from "@/lib/inputValidation";

export interface PasswordFieldProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (sanitizedValue: string) => void;
  onValidChange?: (isValid: boolean) => void;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  allowSpaces?: boolean;
  showCounter?: boolean;
  showIcon?: boolean;
  showToggle?: boolean;
  autoFocus?: boolean;
  forceTouched?: boolean;
  hint?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
}

export function PasswordField({
  id,
  label = "Password",
  value,
  onChange,
  onValidChange,
  placeholder = "Enter password...",
  required = true,
  minLength = 4,
  maxLength = 128,
  allowSpaces = false,
  showCounter = false,
  showIcon = true,
  showToggle = true,
  autoFocus = false,
  forceTouched = false,
  hint,
  className,
  inputClassName,
  disabled = false,
}: PasswordFieldProps) {
  const autoId = useId();
  const fieldId = id || `password-field-${autoId}`;
  const [blurredWithContent, setBlurredWithContent] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);

  const validation = validatePassword(value, {
    label,
    minLength,
    maxLength,
    required,
    allowSpaces,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const clean = sanitizePasswordInput(e.target.value, {
      allowSpaces,
      maxLength,
    });
    onChange(clean);
    if (blurredWithContent) {
      setBlurredWithContent(false);
    }
    const nextCheck = validatePassword(clean, {
      label,
      minLength,
      maxLength,
      required,
      allowSpaces,
    });
    onValidChange?.(nextCheck.valid);
  };

  const handleFocus = () => {
    setFocused(true);
  };

  const handleBlur = () => {
    setFocused(false);
    setBlurredWithContent(value.length > 0);
    onValidChange?.(validation.valid);
  };

  const shouldShowError =
    !focused &&
    !validation.valid &&
    (forceTouched || (blurredWithContent && value.length > 0));

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
          <KeyRound className="w-4 h-4 text-(--text-muted) absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        )}
        <input
          id={fieldId}
          name={`field_${autoId.replace(/:/g, "")}`}
          type="text"
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
          autoFocus={autoFocus}
          disabled={disabled}
          aria-invalid={shouldShowError}
          aria-describedby={shouldShowError ? `${fieldId}-error` : undefined}
          style={
            !visible && value.length > 0
              ? ({
                  WebkitTextSecurity: "disc",
                } as React.CSSProperties)
              : undefined
          }
          className={getFieldControlClassName({
            hasError: shouldShowError,
            hasLeftIcon: showIcon,
            hasRightSlot: showToggle,
            className: inputClassName,
          })}
        />
        {showToggle && (
          <button
            type="button"
            onClick={() => setVisible((prev) => !prev)}
            aria-label={visible ? "Hide password" : "Show password"}
            title={visible ? "Hide password" : "Show password"}
            tabIndex={-1}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-(--text-muted) hover:text-(--text-primary) transition-colors cursor-pointer"
          >
            {visible ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        )}
      </div>
    </FieldWrapper>
  );
}
