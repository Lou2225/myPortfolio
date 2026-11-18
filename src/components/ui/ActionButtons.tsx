"use client";

import React from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Magnetic } from "@/components/motion/Magnetic";
import { FIELD_SLOT_BUTTON_CLASS } from "@/components/ui/fields/inputStyles";

export interface IconActionButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  label: string;
  icon: React.ReactNode;
  intent?: "neutral" | "danger";
  size?: "xs" | "field" | "square" | "compact";
  magnetic?: boolean;
}

const ICON_SIZE_CLASSES: Record<
  NonNullable<IconActionButtonProps["size"]>,
  string
> = {
  xs: "h-6 w-6 rounded-full",
  field: "h-10.5 w-10.5 rounded-full",
  square: "h-10 w-10 rounded-full",
  compact: "h-8.5 w-8.5 rounded-full",
};

const ICON_INTENT_CLASSES: Record<
  NonNullable<IconActionButtonProps["intent"]>,
  string
> = {
  neutral:
    "bg-(--bg-surface-2) hover:bg-(--bg-badge-highlight) border border-(--border-strong) hover:border-brand text-(--text-muted) hover:text-(--text-accent)",
  danger:
    "bg-rose-500/12 hover:bg-rose-500/22 border border-rose-500/40 hover:border-rose-500/65 text-rose-500 hover:text-rose-400",
};

/**
 * Reusable circular magnetic icon button matching public
 * portfolio interaction physics across headers, cards, and form slots.
 */
export function IconActionButton({
  label,
  icon,
  intent = "neutral",
  size = "field",
  magnetic = true,
  type = "button",
  title,
  className,
  ...props
}: IconActionButtonProps) {
  const buttonEl = (
    <button
      type={type}
      aria-label={label}
      title={title ?? label}
      className={cn(
        "inline-flex items-center justify-center cursor-pointer transition-all duration-300 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-30 disabled:cursor-not-allowed shrink-0",
        ICON_SIZE_CLASSES[size],
        ICON_INTENT_CLASSES[intent],
        className
      )}
      {...props}
    >
      {icon}
    </button>
  );

  if (magnetic && !props.disabled) {
    return (
      <Magnetic strength={size === "xs" || size === "field" ? 0.14 : 0.2}>
        {buttonEl}
      </Magnetic>
    );
  }

  return buttonEl;
}

export interface ReorderActionGroupProps {
  index: number;
  total: number;
  itemLabel: string;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove?: () => void;
  canRemove?: boolean;
  size?: "field" | "compact";
  className?: string;
}

/**
 * Standardized reorder (Move Up / Move Down) + Remove action button group
 * matching Hero Role Titles (Top-Left Stack).
 */
export function ReorderActionGroup({
  index,
  total,
  itemLabel,
  onMoveUp,
  onMoveDown,
  onRemove,
  canRemove = total > 1,
  size = "field",
  className,
}: ReorderActionGroupProps) {
  return (
    <div className={cn("flex items-center gap-1 shrink-0", className)}>
      <IconActionButton
        label={`Move ${itemLabel} earlier`}
        disabled={index === 0}
        onClick={onMoveUp}
        size={size}
        icon={<ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />}
      />
      <IconActionButton
        label={`Move ${itemLabel} later`}
        disabled={index === total - 1}
        onClick={onMoveDown}
        size={size}
        icon={<ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />}
      />
      {onRemove && (
        <IconActionButton
          label={
            canRemove
              ? `Remove ${itemLabel}`
              : `At least one ${itemLabel.toLowerCase()} is required`
          }
          intent="danger"
          disabled={!canRemove}
          onClick={onRemove}
          size={size}
          icon={<Trash2 className="w-3.5 h-3.5" aria-hidden="true" />}
        />
      )}
    </div>
  );
}

export type FieldSlotButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  magnetic?: boolean;
};

/**
 * Reusable right-slot text+icon action button aligned to 42px (h-10.5) inputs.
 */
export function FieldSlotButton({
  type = "button",
  magnetic = true,
  className,
  children,
  ...props
}: FieldSlotButtonProps) {
  const buttonEl = (
    <button
      type={type}
      className={cn(
        FIELD_SLOT_BUTTON_CLASS,
        "transition-all duration-300 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );

  if (magnetic && !props.disabled) {
    return <Magnetic strength={0.14}>{buttonEl}</Magnetic>;
  }

  return buttonEl;
}
