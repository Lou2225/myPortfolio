import { cn } from "@/lib/utils";

/**
 * Shared Tailwind classes ensuring every reusable single-line input, select, date,
 * and right-slot action button under src/components/ui/fields renders at an
 * identical 42px (h-10.5) height and consistent border/focus/theme contrast.
 */
export const FIELD_CONTROL_BASE_CLASS =
  "theme-input w-full h-10.5 bg-[#17171b] border rounded-(--radius-control) text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

export const FIELD_SLOT_BUTTON_CLASS =
  "h-10.5 px-3.5 rounded-full bg-(--bg-surface-2) hover:bg-(--bg-badge-highlight) border border-(--border-strong) hover:border-brand/50 text-xs font-mono uppercase tracking-wider text-(--text-primary) inline-flex items-center justify-center gap-1.5 cursor-pointer shrink-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

export function getFieldControlClassName(options?: {
  hasError?: boolean;
  hasLeftIcon?: boolean;
  hasRightSlot?: boolean;
  mono?: boolean;
  className?: string;
}): string {
  return cn(
    FIELD_CONTROL_BASE_CLASS,
    options?.mono && "font-mono text-xs",
    options?.hasLeftIcon ? "pl-10" : "pl-3.5",
    options?.hasRightSlot ? "pr-10" : "pr-3.5",
    options?.hasError
      ? "border-brand/70 focus:border-brand"
      : "border-(--border-subtle) focus:border-brand",
    options?.className
  );
}
