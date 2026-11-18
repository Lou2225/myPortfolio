"use client";

import React from "react";
import { SortableTextRow } from "@/components/admin/SortableTextRow";

export interface HeroRoleRowProps {
  index: number;
  totalRoles: number;
  value: string;
  forceTouched: boolean;
  onChange: (nextVal: string) => void;
  onMove: (direction: "up" | "down") => void;
  onRemove: () => void;
}

/**
 * Modular Hero role editor row powered by shared `SortableTextRow` (`ActionMenuButton` UI).
 */
export function HeroRoleRow({
  index,
  totalRoles,
  value,
  forceTouched,
  onChange,
  onMove,
  onRemove,
}: HeroRoleRowProps) {
  return (
    <SortableTextRow
      label={`Role Title ${String(index + 1).padStart(2, "0")}`}
      itemNoun="role"
      removeLabel="Remove Role"
      index={index}
      totalCount={totalRoles}
      value={value}
      minLength={2}
      maxLength={60}
      forceTouched={forceTouched}
      onChange={onChange}
      onMove={onMove}
      onRemove={onRemove}
    />
  );
}
