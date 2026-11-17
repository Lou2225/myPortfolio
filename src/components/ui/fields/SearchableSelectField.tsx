"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Search, X } from "lucide-react";
import { DropdownPopover } from "@/components/ui/DropdownPopover";
import { TruncatedText } from "@/components/ui/Tooltip";
import { FieldWrapper } from "./FieldWrapper";
import { getFieldControlClassName } from "./inputStyles";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

export interface SearchableSelectFieldProps {
  id?: string;
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string, selectedOption?: SelectOption) => void;
  onValidChange?: (isValid: boolean) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  required?: boolean;
  allowClear?: boolean;
  loading?: boolean;
  forceTouched?: boolean;
  errorMessage?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
}

/**
 * Reusable searchable select dropdown built cleanly atop DropdownPopover
 * and FieldWrapper so PSGC and other large lists match ProfileDropdown UX
 * and 42px (h-10.5) field height alignment.
 */
export function SearchableSelectField({
  id,
  label,
  value,
  options,
  onChange,
  onValidChange,
  placeholder = "Select an option...",
  searchPlaceholder = "Type to filter...",
  emptyText = "No matching entries found.",
  required = false,
  allowClear = false,
  loading = false,
  forceTouched = false,
  errorMessage,
  hint,
  leftIcon,
  className,
  triggerClassName,
  disabled = false,
}: SearchableSelectFieldProps) {
  const autoId = useId();
  const fieldId = id || `searchable-select-${autoId}`;
  const searchInputRef = useRef<HTMLInputElement>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    };
  }, []);

  const [query, setQuery] = useState("");
  const [blurred, setBlurred] = useState(false);

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value]
  );

  const filteredOptions = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return options;
    return options.filter((opt) =>
      opt.label.toLowerCase().includes(trimmed)
    );
  }, [options, query]);

  const missingRequired = required && !value.trim();
  const isValid = !missingRequired && !errorMessage;
  const computedError =
    errorMessage ||
    (missingRequired ? `Please select a ${label.toLowerCase()}.` : undefined);
  const shouldShowError =
    !isValid &&
    !loading &&
    (!disabled || Boolean(errorMessage)) &&
    (forceTouched || blurred || Boolean(errorMessage));

  const handleOpenChange = (nextOpen: boolean) => {
    if (focusTimerRef.current) {
      clearTimeout(focusTimerRef.current);
      focusTimerRef.current = null;
    }
    if (nextOpen) {
      setQuery("");
      focusTimerRef.current = setTimeout(() => {
        searchInputRef.current?.focus({ preventScroll: true });
      }, 45);
    } else {
      setBlurred(true);
    }
  };

  const handlePick = (opt: SelectOption, close: () => void) => {
    onChange(opt.value, opt);
    onValidChange?.(Boolean(!required || opt.value.trim()));
    setQuery("");
    close();
  };

  const handleClear = (close: () => void) => {
    onChange("", undefined);
    onValidChange?.(!required);
    setQuery("");
    close();
  };

  const isDisabled = disabled || loading;

  return (
    <FieldWrapper
      id={fieldId}
      label={label}
      required={required}
      touched={shouldShowError}
      valid={isValid}
      error={computedError}
      hint={hint}
      showCounter={false}
      className={className}
    >
      <DropdownPopover
        align="start"
        portal
        overflowMode="clip"
        widthClassName="w-full min-w-64"
        className="w-full block"
        disabled={isDisabled}
        onOpenChange={handleOpenChange}
        trigger={({ isOpen, toggle }) => (
          <button
            id={fieldId}
            type="button"
            role="combobox"
            onClick={toggle}
            disabled={isDisabled}
            aria-haspopup="listbox"
            aria-controls={`${fieldId}-listbox`}
            aria-expanded={isOpen}
            aria-invalid={shouldShowError}
            aria-describedby={shouldShowError ? `${fieldId}-error` : undefined}
            className={getFieldControlClassName({
              hasError: shouldShowError,
              hasLeftIcon: Boolean(leftIcon),
              hasRightSlot: true,
              className: cn(
                "flex items-center justify-between text-left cursor-pointer",
                isOpen && "border-brand ring-2 ring-(--accent-ring)",
                triggerClassName
              ),
            })}
          >
            {leftIcon && (
              <span className="text-(--text-muted) absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                {leftIcon}
              </span>
            )}

            <TruncatedText
              text={
                loading
                  ? `Loading ${label}...`
                  : selectedOption?.label || placeholder
              }
              className={cn(
                "block min-w-0",
                selectedOption ? "text-(--text-primary)" : "text-(--text-muted)"
              )}
            />

            <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-(--text-muted)">
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin text-(--text-accent)" />
              ) : (
                <ChevronDown
                  className={cn(
                    "w-4 h-4 transition-transform duration-200",
                    isOpen && "rotate-180 text-(--text-accent)"
                  )}
                />
              )}
            </span>
          </button>
        )}
      >
        {({ close }) => (
          <div className="flex flex-col w-full min-w-0 max-h-(--dropdown-max-h,18rem) overflow-hidden divide-y divide-(--border-subtle) text-xs">
            {/* Search Box */}
            <div className="p-2.5 shrink-0 flex items-center gap-2 bg-(--bg-surface-2)/70 rounded-t-xl">
              <Search className="w-3.5 h-3.5 text-(--text-muted) shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (filteredOptions[0]) {
                      handlePick(filteredOptions[0], close);
                    }
                  }
                }}
                placeholder={searchPlaceholder}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                className="flex-1 min-w-0 bg-transparent text-xs text-(--text-primary) placeholder:text-(--text-muted) focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search filter"
                  className="p-0.5 text-(--text-muted) hover:text-(--text-primary) cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filtered Options List (Single Scroll Area, X clipped) */}
            <div
              id={`${fieldId}-listbox`}
              role="listbox"
              aria-label={label}
              data-lenis-prevent
              className="lou-scrollarea flex-1 min-h-0 max-h-56 overflow-y-auto overflow-x-hidden p-1.5 space-y-0.5"
            >
              {allowClear && value && (
                <button
                  type="button"
                  onClick={() => handleClear(close)}
                  className="w-full px-3 py-2 rounded-lg text-left text-[11px] font-mono uppercase tracking-wider text-(--text-muted) hover:text-rose-400 hover:bg-rose-500/10 flex items-center justify-between transition-colors cursor-pointer"
                >
                  <span>Clear selection</span>
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              {filteredOptions.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-(--text-muted)">
                  {emptyText}
                </p>
              ) : (
                filteredOptions.map((opt) => {
                  const isSelected = opt.value === value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handlePick(opt, close)}
                      className={cn(
                        "w-full min-w-0 max-w-full overflow-hidden px-3 py-2 rounded-lg text-left flex items-center justify-between gap-2 transition-colors cursor-pointer",
                        isSelected
                          ? "bg-brand/12 text-(--text-accent) font-medium"
                          : "text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--bg-surface-2)"
                      )}
                    >
                      <TruncatedText
                        text={opt.label}
                        className="block flex-1 min-w-0"
                      />
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-(--text-accent) shrink-0" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </DropdownPopover>
    </FieldWrapper>
  );
}
