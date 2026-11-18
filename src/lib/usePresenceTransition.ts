"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * Coordinates flicker-free GPU portal mount, two-frame post-commit reveal,
 * and delayed exit cleanup. Waiting until `mounted && open` commits before
 * flushing initial layout styles prevents first-frame jumps and blur flashes.
 */
export function usePresenceTransition<T extends HTMLElement = HTMLDivElement>(
  open: boolean,
  exitDurationMs: number,
  targetRef?: RefObject<T | null>
): { mounted: boolean; visible: boolean } {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);

  // Stage 1: Mount portal container cleanly on open, or hide + delay unmount on close.
  useEffect(() => {
    if (open) {
      const mountRaf = requestAnimationFrame(() => {
        setMounted(true);
      });
      return () => cancelAnimationFrame(mountRaf);
    }

    const hideRaf = requestAnimationFrame(() => {
      setVisible(false);
    });
    const unmountTimer = setTimeout(() => {
      setMounted(false);
    }, exitDurationMs);

    return () => {
      cancelAnimationFrame(hideRaf);
      clearTimeout(unmountTimer);
    };
  }, [open, exitDurationMs]);

  // Stage 2: Runs only after `mounted && open` has committed to the DOM so Frame 1
  // paints the resting opacity-0 state before transitioning smoothly to opacity-100.
  useEffect(() => {
    if (!mounted || !open) return;

    let frame2 = 0;
    const frame1 = requestAnimationFrame(() => {
      if (targetRef?.current) {
        void targetRef.current.offsetHeight;
      }
      frame2 = requestAnimationFrame(() => {
        setVisible(true);
      });
    });

    return () => {
      cancelAnimationFrame(frame1);
      cancelAnimationFrame(frame2);
    };
  }, [mounted, open, targetRef]);

  return { mounted, visible };
}
