import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function swapArrayItem<T>(
  items: readonly T[],
  index: number,
  direction: -1 | 1
): T[] {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= items.length) return [...items];
  const next = [...items];
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  return next;
}

export function findDuplicateValues(values: readonly string[]): Set<string> {
  const counts = new Map<string, number>();
  for (const raw of values) {
    const norm = raw.trim().toLowerCase();
    if (!norm) continue;
    counts.set(norm, (counts.get(norm) ?? 0) + 1);
  }
  const duplicates = new Set<string>();
  for (const [key, count] of counts.entries()) {
    if (count > 1) duplicates.add(key);
  }
  return duplicates;
}

/**
 * Dynamically measures the lowest sticky/fixed header ceiling
 * tagged with `data-sticky-ceiling="true"` inside the upper viewport band.
 */
export function measureStickyCeilingPx(
  defaultClearancePx = 76,
  paddingPx = 8
): number {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return defaultClearancePx;
  }
  const stickyNodes = document.querySelectorAll<HTMLElement>(
    "[data-sticky-ceiling='true']"
  );
  let ceiling = defaultClearancePx;
  const maxAllowedHeaderBand = window.innerHeight * 0.45;
  stickyNodes.forEach((node) => {
    const r = node.getBoundingClientRect();
    if (r.height > 0 && r.bottom > 0 && r.bottom < maxAllowedHeaderBand) {
      ceiling = Math.max(ceiling, Math.ceil(r.bottom) + paddingPx);
    }
  });
  return ceiling;
}



