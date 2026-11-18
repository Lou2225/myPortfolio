"use client";

import React from "react";
import { ArrowDown, ArrowUp, MoreVertical, Trash2 } from "lucide-react";
import { DropdownPopover } from "@/components/ui/DropdownPopover";
import { IconActionButton } from "@/components/ui/ActionButtons";
import { cn } from "@/lib/utils";

export interface ActionMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  intent?: "neutral" | "warning" | "danger";
  disabled?: boolean;
  onSelect: () => void;
}

export interface ActionMenuButtonProps {
  label: string;
  items: readonly ActionMenuItem[];
  size?: "field" | "square" | "compact";
  disabled?: boolean;
  align?: "start" | "center" | "end";
  className?: string;
}

/**
 * Reusable 3-dots (`MoreVertical`) contextual action menu powered by `DropdownPopover`.
 * Keeps secondary actions (Move Up, Move Down, Crop, Revert, Red Delete) compact and
 * accessible with full keyboard Escape, outside-click, and portal viewport clamping.
 */
export function ActionMenuButton({
  label,
  items,
  size = "field",
  disabled = false,
  align = "end",
  className,
}: ActionMenuButtonProps) {
  return (
    <DropdownPopover
      align={align}
      portal
      minWidth={188}
      estimatedHeight={items.length * 40 + 16}
      overflowMode="none"
      disabled={disabled}
      className={cn("inline-flex shrink-0", className)}
      trigger={({ isOpen, toggle }) => (
        <IconActionButton
          label={label}
          size={size}
          disabled={disabled}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          onClick={toggle}
          className={cn(
            isOpen && "border-brand text-(--text-accent) bg-(--bg-badge-highlight)"
          )}
          icon={<MoreVertical className="w-4 h-4" aria-hidden="true" />}
        />
      )}
    >
      {({ close }) => (
        <div
          role="menu"
          aria-label={label}
          className="p-1.5 space-y-0.5 bg-(--bg-surface-elevated)"
        >
          {items.map((item) => {
            const isDanger = item.intent === "danger";
            const isWarning = item.intent === "warning";

            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  if (item.disabled) return;
                  close();
                  item.onSelect();
                }}
                className={cn(
                  "w-full text-left px-2.5 py-2 rounded-(--radius-control) text-xs font-medium flex items-center gap-2.5 transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed",
                  isDanger
                    ? "text-rose-500 hover:bg-rose-500/15 hover:text-rose-400"
                    : isWarning
                      ? "text-amber-400 hover:bg-amber-500/12"
                      : "text-(--text-primary) hover:bg-(--bg-surface-2)"
                )}
              >
                {item.icon && (
                  <span className="shrink-0 w-4 h-4 inline-flex items-center justify-center">
                    {item.icon}
                  </span>
                )}
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </DropdownPopover>
  );
}

/**
 * Shared factory generating consistent Move Earlier / Move Later / Red Remove
 * items for `ActionMenuButton` across Profile roles, Story, Skills, Metrics, and Projects.
 */
export function buildReorderMenuItems({
  index,
  total,
  onMoveUp,
  onMoveDown,
  onRemove,
  removeLabel = "Remove",
  canRemove = total > 1,
}: {
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove?: () => void;
  removeLabel?: string;
  canRemove?: boolean;
}): ActionMenuItem[] {
  const items: ActionMenuItem[] = [
    {
      id: "up",
      label: "Move Earlier",
      icon: <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />,
      disabled: index === 0,
      onSelect: onMoveUp,
    },
    {
      id: "down",
      label: "Move Later",
      icon: <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />,
      disabled: index >= total - 1,
      onSelect: onMoveDown,
    },
  ];

  if (onRemove) {
    items.push({
      id: "remove",
      label: removeLabel,
      icon: <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />,
      intent: "danger",
      disabled: !canRemove,
      onSelect: onRemove,
    });
  }

  return items;
}
