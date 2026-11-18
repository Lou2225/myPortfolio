"use client";

import React from "react";
import { TextField } from "@/components/ui/fields";
import {
  ActionMenuButton,
  buildReorderMenuItems,
} from "@/components/ui/ActionMenuButton";
import type { ValidationResult } from "@/lib/validation";

export interface SortableTextRowProps {
  id?: string;
  label: string;
  /** Noun used in ActionMenuButton accessibility labels (`Actions for ${itemNoun} 1`, `Remove`). */
  itemNoun: string;
  removeLabel?: string;
  index: number;
  totalCount: number;
  value: string;
  placeholder?: string;
  minLength?: number;
  maxLength?: number;
  showCounter?: boolean;
  mono?: boolean;
  uppercase?: boolean;
  forceTouched: boolean;
  hint?: string;
  validate?: (val: string) => ValidationResult;
  /** Optional extra control placed cleanly beside the input before the 3-dots ActionMenuButton (e.g. Highlight Star). */
  inlineActionSlot?: React.ReactNode;
  onChange: (nextVal: string) => void;
  onMove: (direction: "up" | "down") => void;
  onRemove: () => void;
}

/**
 * Unified numbered single-line list editor row matching Story & Marquee's ticker pattern:
 * - Renders a clean numbered `TextField` paired with a circular `42px` 3-dots `ActionMenuButton`
 *   (`Move Earlier`, `Move Later`, red `Remove`) across both mobile and desktop viewports.
 */
export function SortableTextRow({
  id,
  label,
  itemNoun,
  removeLabel = "Remove",
  index,
  totalCount,
  value,
  placeholder,
  minLength = 2,
  maxLength = 60,
  showCounter = false,
  mono = false,
  uppercase = false,
  forceTouched,
  hint,
  validate,
  inlineActionSlot,
  onChange,
  onMove,
  onRemove,
}: SortableTextRowProps) {
  const paddedNumber = String(index + 1).padStart(2, "0");

  const actionMenu = (
    <ActionMenuButton
      label={`Actions for ${itemNoun} ${index + 1}`}
      size="field"
      items={buildReorderMenuItems({
        index,
        total: totalCount,
        onMoveUp: () => onMove("up"),
        onMoveDown: () => onMove("down"),
        removeLabel,
        onRemove,
      })}
    />
  );

  return (
    <TextField
      id={id}
      label={label}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      required
      minLength={minLength}
      maxLength={maxLength}
      showCounter={showCounter}
      mono={mono}
      uppercase={uppercase}
      forceTouched={forceTouched}
      hint={hint}
      validate={validate}
      leftSlot={
        <span className="text-xs font-mono text-(--text-accent)">
          {paddedNumber}
        </span>
      }
      rightSlot={
        inlineActionSlot ? (
          <div className="flex items-center gap-1.5 shrink-0">
            {inlineActionSlot}
            {actionMenu}
          </div>
        ) : (
          actionMenu
        )
      }
    />
  );
}
