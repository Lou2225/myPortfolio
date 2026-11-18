"use client";

import { useSyncExternalStore } from "react";

const SERVER_SNAPSHOT = false;

/**
 * SSR-safe reactive CSS media query hook backed by `useSyncExternalStore`.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => {};
      const mediaQueryList = window.matchMedia(query);
      mediaQueryList.addEventListener("change", onStoreChange);
      return () => mediaQueryList.removeEventListener("change", onStoreChange);
    },
    () => (typeof window !== "undefined" ? window.matchMedia(query).matches : false),
    () => SERVER_SNAPSHOT
  );
}
