"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export interface UsePointerReorderOptions {
  itemCount: number;
  /** Disable pointer reordering cleanly (e.g. on desktop when 3-dots menu controls ordering). */
  enabled?: boolean;
  /**
   * Optional press-and-hold delay before starting drag (e.g. `180`ms on mobile rows
   * without a dedicated grip button so vertical page scroll, swipe gestures, and taps still work).
   */
  activationDelayMs?: number;
  onMove: (fromIndex: number, toIndex: number) => void;
}

const TOUCH_DRAG_SLOP_PX = 8;
const SWAP_HYSTERESIS_PX = 6;
const SIBLING_FLIP_TRANSITION = "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)";

function getOffsetParentTop(el: HTMLElement | null): number {
  const parent = el?.offsetParent as HTMLElement | null;
  return parent ? parent.getBoundingClientRect().top : 0;
}

/**
 * Deterministic 60–120 FPS vertical pointer drag-to-sort hook.
 * Uses window-level `pointermove` / `pointerup` / `pointercancel` listeners so releasing
 * anywhere always settles cleanly, locks movement strictly to the Y axis, checks only
 * immediate neighbor midpoints using layout `offsetTop`, and FLIP-glides swapped siblings.
 */
export function usePointerReorder({
  itemCount,
  enabled = true,
  activationDelayMs = 0,
  onMove,
}: UsePointerReorderOptions) {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  const itemCountRef = useRef(itemCount);
  const onMoveRef = useRef(onMove);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClickRef = useRef(false);
  const suppressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detachWindowListenersRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    itemCountRef.current = itemCount;
    onMoveRef.current = onMove;
  }, [itemCount, onMove]);

  const dragRef = useRef<{
    pending: boolean;
    active: boolean;
    pendingCommit: boolean;
    pointerId: number;
    targetEl: HTMLElement | null;
    currentIndex: number;
    startClientX: number;
    startClientY: number;
    startLayoutTop: number;
    startParentTop: number;
    lastClientY: number;
    prevLayoutTops: number[] | null;
  }>({
    pending: false,
    active: false,
    pendingCommit: false,
    pointerId: -1,
    targetEl: null,
    currentIndex: -1,
    startClientX: 0,
    startClientY: 0,
    startLayoutTop: 0,
    startParentTop: 0,
    lastClientY: 0,
    prevLayoutTops: null,
  });

  const registerItemRef = useCallback(
    (index: number) => (el: HTMLElement | null) => {
      itemRefs.current[index] = el;
    },
    []
  );

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const resetAllTransforms = useCallback(() => {
    itemRefs.current.forEach((el) => {
      if (!el) return;
      el.style.transition = "";
      el.style.transform = "";
      el.style.zIndex = "";
    });
  }, []);

  const endDrag = useCallback(() => {
    clearHoldTimer();
    detachWindowListenersRef.current?.();
    detachWindowListenersRef.current = null;

    const state = dragRef.current;
    const wasActive = state.active;
    const targetEl = state.targetEl;
    const pointerId = state.pointerId;

    state.pending = false;
    state.active = false;
    state.pendingCommit = false;
    state.pointerId = -1;
    state.targetEl = null;
    state.currentIndex = -1;
    state.prevLayoutTops = null;

    if (targetEl && pointerId >= 0) {
      try {
        if (targetEl.hasPointerCapture(pointerId)) {
          targetEl.releasePointerCapture(pointerId);
        }
      } catch {
        // Ignore synthetic pointer release warnings
      }
    }

    if (wasActive) {
      suppressClickRef.current = true;
      if (suppressTimerRef.current) clearTimeout(suppressTimerRef.current);
      suppressTimerRef.current = setTimeout(() => {
        suppressClickRef.current = false;
      }, 160);
      resetAllTransforms();
      setDraggingIndex(null);
    }
  }, [clearHoldTimer, resetAllTransforms]);

  useEffect(() => {
    const handleTouchMove = (e: TouchEvent) => {
      if (dragRef.current.active && e.cancelable) {
        e.preventDefault();
      }
    };
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    return () => {
      window.removeEventListener("touchmove", handleTouchMove);
      endDrag();
      if (suppressTimerRef.current) clearTimeout(suppressTimerRef.current);
    };
  }, [endDrag]);

  // Keep dragged item locked 1:1 to finger Y and smoothly FLIP-glide shifted siblings
  useLayoutEffect(() => {
    const state = dragRef.current;
    if (!state.active || state.currentIndex < 0) return;

    const activeEl = itemRefs.current[state.currentIndex];
    if (!activeEl) return;

    const parentTopShift = getOffsetParentTop(activeEl) - state.startParentTop;
    const pointerDeltaY = state.lastClientY - state.startClientY - parentTopShift;
    const visualDy = state.startLayoutTop + pointerDeltaY - activeEl.offsetTop;

    activeEl.style.transition = "none";
    activeEl.style.transform = `translate3d(0px, ${visualDy}px, 0) scale(1.015)`;
    activeEl.style.zIndex = "30";

    if (state.prevLayoutTops) {
      const count = itemCountRef.current;
      const movedEls: HTMLElement[] = [];
      for (let i = 0; i < count; i++) {
        if (i === state.currentIndex) continue;
        const sibling = itemRefs.current[i];
        const prevTop = state.prevLayoutTops[i];
        if (!sibling || typeof prevTop !== "number") continue;

        const deltaTop = prevTop - sibling.offsetTop;
        if (Math.abs(deltaTop) > 1) {
          sibling.style.transition = "none";
          sibling.style.transform = `translate3d(0px, ${deltaTop}px, 0)`;
          movedEls.push(sibling);
        }
      }

      if (movedEls.length > 0) {
        // Flush starting FLIP transforms once before gliding neighbors to their new slot
        void movedEls[0].offsetHeight;
        for (const el of movedEls) {
          el.style.transition = SIBLING_FLIP_TRANSITION;
          el.style.transform = "";
        }
      }

      state.prevLayoutTops = null;
    }

    state.pendingCommit = false;
  });

  const activateDrag = useCallback(() => {
    const state = dragRef.current;
    if (!state.pending || state.currentIndex < 0) return;

    const activeContainer = itemRefs.current[state.currentIndex];
    if (!activeContainer) return;

    state.pending = false;
    state.active = true;
    state.pendingCommit = false;
    state.startLayoutTop = activeContainer.offsetTop;
    state.startParentTop = getOffsetParentTop(activeContainer);
    suppressClickRef.current = true;

    const activeEl = document.activeElement as HTMLElement | null;
    if (activeEl && state.targetEl?.contains(activeEl)) {
      activeEl.blur();
    }
    window.getSelection?.()?.removeAllRanges?.();

    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      try {
        navigator.vibrate(10);
      } catch {
        // Ignore vibrate permission restrictions
      }
    }

    activeContainer.style.transition = "none";
    activeContainer.style.transform = "translate3d(0px, 0px, 0) scale(1.015)";
    activeContainer.style.zIndex = "30";

    setDraggingIndex(state.currentIndex);
  }, []);

  const attachWindowListeners = useCallback(() => {
    detachWindowListenersRef.current?.();

    const handleWindowPointerMove = (e: PointerEvent) => {
      const state = dragRef.current;
      if (e.pointerId !== state.pointerId) return;

      // Cancel pending hold immediately on normal vertical scroll or horizontal swipe
      if (state.pending && !state.active) {
        const moveX = Math.abs(e.clientX - state.startClientX);
        const moveY = Math.abs(e.clientY - state.startClientY);
        if (moveX > TOUCH_DRAG_SLOP_PX || moveY > TOUCH_DRAG_SLOP_PX) {
          endDrag();
        }
        return;
      }

      if (!state.active) return;

      state.lastClientY = e.clientY;
      const curIdx = state.currentIndex;
      const activeEl = itemRefs.current[curIdx];
      if (!activeEl) return;

      const parentTopShift = getOffsetParentTop(activeEl) - state.startParentTop;
      const pointerDeltaY = e.clientY - state.startClientY - parentTopShift;
      const visualDy = state.startLayoutTop + pointerDeltaY - activeEl.offsetTop;

      activeEl.style.transition = "none";
      activeEl.style.transform = `translate3d(0px, ${visualDy}px, 0) scale(1.015)`;
      activeEl.style.zIndex = "30";

      if (state.pendingCommit) return;

      const count = itemCountRef.current;
      const draggedCenterY =
        state.startLayoutTop + activeEl.offsetHeight / 2 + pointerDeltaY;

      let targetIndex: number | null = null;

      if (curIdx > 0) {
        const aboveEl = itemRefs.current[curIdx - 1];
        if (aboveEl) {
          const aboveCenterY = aboveEl.offsetTop + aboveEl.offsetHeight / 2;
          if (draggedCenterY < aboveCenterY - SWAP_HYSTERESIS_PX) {
            targetIndex = curIdx - 1;
          }
        }
      }

      if (targetIndex === null && curIdx < count - 1) {
        const belowEl = itemRefs.current[curIdx + 1];
        if (belowEl) {
          const belowCenterY = belowEl.offsetTop + belowEl.offsetHeight / 2;
          if (draggedCenterY > belowCenterY + SWAP_HYSTERESIS_PX) {
            targetIndex = curIdx + 1;
          }
        }
      }

      if (targetIndex !== null) {
        const postSwapPrevTops = itemRefs.current
          .slice(0, count)
          .map((el) => el?.offsetTop ?? 0);
        const [movedTop] = postSwapPrevTops.splice(curIdx, 1);
        postSwapPrevTops.splice(targetIndex, 0, movedTop);

        state.prevLayoutTops = postSwapPrevTops;
        state.pendingCommit = true;
        state.currentIndex = targetIndex;
        setDraggingIndex(targetIndex);
        onMoveRef.current(curIdx, targetIndex);
      }
    };

    const handleWindowPointerEnd = (e: PointerEvent) => {
      if (e.pointerId === dragRef.current.pointerId) {
        endDrag();
      }
    };

    const handleWindowBlur = () => {
      endDrag();
    };

    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerEnd);
    window.addEventListener("pointercancel", handleWindowPointerEnd);
    window.addEventListener("blur", handleWindowBlur);

    detachWindowListenersRef.current = () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerEnd);
      window.removeEventListener("pointercancel", handleWindowPointerEnd);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [endDrag]);

  const getDragProps = useCallback(
    (index: number) => {
      if (!enabled || itemCount <= 1) {
        return {};
      }

      return {
        onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
          if (!enabled || itemCountRef.current <= 1 || e.button !== 0) return;

          const target = e.target as HTMLElement | null;
          if (target?.closest("button, a, [role='menu']")) return;

          // Keep native cursor placement / text selection when the field input is already focused
          if (
            (target instanceof HTMLInputElement ||
              target instanceof HTMLTextAreaElement) &&
            document.activeElement === target
          ) {
            return;
          }

          clearHoldTimer();
          const containerEl = itemRefs.current[index];
          dragRef.current = {
            pending: activationDelayMs > 0,
            active: activationDelayMs === 0,
            pendingCommit: false,
            pointerId: e.pointerId,
            targetEl: e.currentTarget,
            currentIndex: index,
            startClientX: e.clientX,
            startClientY: e.clientY,
            startLayoutTop: containerEl?.offsetTop ?? 0,
            startParentTop: getOffsetParentTop(containerEl),
            lastClientY: e.clientY,
            prevLayoutTops: null,
          };

          attachWindowListeners();

          if (activationDelayMs === 0) {
            e.preventDefault();
            e.stopPropagation();
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              // Ignore synthetic pointer capture issues
            }
            setDraggingIndex(index);
            return;
          }

          holdTimerRef.current = setTimeout(() => {
            activateDrag();
          }, activationDelayMs);
        },
        onContextMenu: (e: React.MouseEvent<HTMLElement>) => {
          if (dragRef.current.pending || dragRef.current.active) {
            e.preventDefault();
          }
        },
        onClickCapture: (e: React.MouseEvent<HTMLElement>) => {
          if (suppressClickRef.current) {
            e.preventDefault();
            e.stopPropagation();
          }
        },
      };
    },
    [activationDelayMs, activateDrag, attachWindowListeners, clearHoldTimer, enabled, itemCount]
  );

  return {
    draggingIndex,
    registerItemRef,
    getDragProps,
  };
}
