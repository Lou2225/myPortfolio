"use client";

import { useCallback, useRef } from "react";
import { useSmoothScroll } from "@/components/motion/SmoothScroll";
import { measureStickyCeilingPx } from "@/lib/utils";

/**
 * Reusable Validation Follower hook.
 * Scans `[data-field-invalid="true"]` containers inside a form/page, smoothly
 * scrolls the viewport to frame the active error below the sticky header,
 * notifies collapsible sections (e.g. PSGC Location) to auto-expand, focuses
 * the interactive control without browser scroll jumping, and triggers a pulse.
 */
export function useValidationFollower() {
  const { scrollTo, refreshScroll } = useSmoothScroll();
  const issueCursorRef = useRef(0);

  const collectInvalidNodes = useCallback(
    (root?: HTMLElement | null): HTMLElement[] => {
      const scope: Document | HTMLElement = root ?? document;
      const nodes = Array.from(
        scope.querySelectorAll<HTMLElement>("[data-field-invalid='true']")
      );

      // Avoid targeting elements inside collapsed accordions or nested children
      // when an outer section already manages custom expand + sub-field focus.
      return nodes.filter((node) => {
        if (node.closest("[data-collapsed='true']")) return false;
        const parentInvalid = node.parentElement?.closest(
          "[data-field-invalid='true']"
        );
        if (!parentInvalid) return true;
        // Include inner invalid fields if outer wrapper is currently expanded/visible
        return node.offsetHeight > 0;
      });
    },
    []
  );

  const focusNode = useCallback(
    (target: HTMLElement) => {
      // Allow collapsible blocks (e.g. PSGC) to auto-expand cleanly on validation follow
      target.dispatchEvent(
        new CustomEvent("lou-follow-invalid", { bubbles: true })
      );

      setTimeout(() => {
        refreshScroll();
        scrollTo(target, {
          offset: -measureStickyCeilingPx(164, 16),
          duration: 0.55,
        });

        const interactive = target.querySelector<HTMLElement>(
          "[role='combobox'], input:not([type='hidden']), textarea, select, button"
        );
        interactive?.focus({ preventScroll: true });

        target.classList.remove("lou-validation-pulse");
        void target.offsetWidth;
        target.classList.add("lou-validation-pulse");
      }, 60);
    },
    [refreshScroll, scrollTo]
  );

  const followFirstInvalid = useCallback(
    (root?: HTMLElement | null) => {
      issueCursorRef.current = 0;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const nodes = collectInvalidNodes(root);
          const first = nodes[0];
          if (first) {
            focusNode(first);
          }
        });
      });
    },
    [collectInvalidNodes, focusNode]
  );

  const followNextInvalid = useCallback(
    (root?: HTMLElement | null) => {
      const nodes = collectInvalidNodes(root);
      if (nodes.length === 0) return;
      const idx = (issueCursorRef.current + 1) % nodes.length;
      issueCursorRef.current = idx;
      focusNode(nodes[idx]);
    },
    [collectInvalidNodes, focusNode]
  );

  return {
    followFirstInvalid,
    followNextInvalid,
  };
}

