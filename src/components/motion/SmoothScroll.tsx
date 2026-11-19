"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useCallback,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import type Lenis from "lenis";
import { usePortfolio } from "@/context/PortfolioContext";
import {
  APPEARANCE_SYNC_EVENT,
  resolveEffectiveReducedMotion,
} from "@/lib/appearance";

interface ScrollToOptions {
  offset?: number;
  duration?: number;
  immediate?: boolean;
}

interface SmoothScrollContextValue {
  scrollTo: (
    target: string | number | HTMLElement,
    options?: ScrollToOptions
  ) => void;
  refreshScroll: () => void;
  subscribeScroll: (listener: () => void) => () => void;
}

const SmoothScrollContext = createContext<SmoothScrollContextValue>({
  scrollTo: () => {},
  refreshScroll: () => {},
  subscribeScroll: () => () => {},
});

export function useSmoothScroll() {
  return useContext(SmoothScrollContext);
}

export function SmoothScroll({ children }: { children: React.ReactNode }) {
  const { appearance } = usePortfolio();
  const lenisRef = useRef<Lenis | null>(null);
  const appearanceRef = useRef(appearance);
  useEffect(() => {
    appearanceRef.current = appearance;
  }, [appearance]);
  const scrollTriggerRef = useRef<{
    refresh: () => void;
    update: () => void;
    getAll: () => Array<{ kill: () => void }>;
  } | null>(null);
  const scrollListenersRef = useRef<Set<() => void>>(new Set());
  const pathname = usePathname();
  const prevPathRef = useRef(pathname);
  const [lenisEnabled, setLenisEnabled] = useState(true);

  useEffect(() => {
    const evaluate = () => {
      const reduced = resolveEffectiveReducedMotion(appearance);
      setLenisEnabled(Boolean(appearance.smoothScroll) && !reduced);
    };
    const raf = requestAnimationFrame(evaluate);
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    mq?.addEventListener("change", evaluate);
    window.addEventListener(APPEARANCE_SYNC_EVENT, evaluate);
    window.addEventListener("storage", evaluate);
    return () => {
      cancelAnimationFrame(raf);
      mq?.removeEventListener("change", evaluate);
      window.removeEventListener(APPEARANCE_SYNC_EVENT, evaluate);
      window.removeEventListener("storage", evaluate);
    };
  }, [appearance]);

  const subscribeScroll = useCallback((listener: () => void) => {
    scrollListenersRef.current.add(listener);
    return () => {
      scrollListenersRef.current.delete(listener);
    };
  }, []);

  const refreshScroll = useCallback(() => {
    lenisRef.current?.resize();
    scrollTriggerRef.current?.refresh();
  }, []);

  const scrollTo = useCallback(
    (
      target: string | number | HTMLElement,
      options?: ScrollToOptions
    ) => {
      const lenis = lenisRef.current;
      const offset = options?.offset ?? (typeof target === "number" ? 0 : -72);
      const duration = options?.duration ?? 1.4;
      const reduced = resolveEffectiveReducedMotion(appearanceRef.current);
      const immediate = Boolean(options?.immediate) || reduced;

      if (lenis) {
        lenis.resize();
        if (target === "#top" || target === 0) {
          lenis.scrollTo(0, {
            immediate,
            duration: immediate ? 0 : duration,
            easing: (t: number) => 1 - Math.pow(1 - t, 4),
          });
        } else {
          lenis.scrollTo(target, {
            offset,
            immediate,
            duration: immediate ? 0 : duration,
            easing: (t: number) => 1 - Math.pow(1 - t, 4),
          });
        }
      } else {
        if (target === "#top" || target === 0) {
          window.scrollTo({
            top: 0,
            behavior: immediate ? "auto" : "smooth",
          });
        } else if (typeof target === "number") {
          window.scrollTo({
            top: Math.max(0, target + offset),
            behavior: immediate ? "auto" : "smooth",
          });
        } else if (typeof target === "string") {
          const el = document.querySelector(target);
          if (el) {
            const top = el.getBoundingClientRect().top + window.scrollY + offset;
            window.scrollTo({
              top,
              behavior: immediate ? "auto" : "smooth",
            });
          }
        } else if (target instanceof HTMLElement) {
          const top = target.getBoundingClientRect().top + window.scrollY + offset;
          window.scrollTo({
            top,
            behavior: immediate ? "auto" : "smooth",
          });
        }
      }
    },
    []
  );

  useEffect(() => {
    if (prevPathRef.current === pathname) return;
    prevPathRef.current = pathname;

    if (typeof window !== "undefined" && !window.location.hash) {
      if (lenisRef.current) {
        lenisRef.current.scrollTo(0, { immediate: true });
      }
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
    }
  }, [pathname]);

  useEffect(() => {
    const handleAnchorClick = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest("a[href^='#']") as HTMLAnchorElement | null;
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || !href.startsWith("#")) return;

      e.preventDefault();
      scrollTo(href);

      if (window.history.pushState) {
        window.history.pushState(null, "", href);
      }
    };

    document.addEventListener("click", handleAnchorClick);

    let cancelled = false;
    let started = false;
    let nativeScrollListener: (() => void) | null = null;
    let activeLenis: Lenis | null = null;
    let activeLenisScrollHandler: (() => void) | null = null;
    let activeTickerCallback: ((time: number) => void) | null = null;
    let activeGsap: {
      ticker: {
        add: (cb: (time: number) => void) => void;
        remove: (cb: (time: number) => void) => void;
        lagSmoothing: (lag: number) => void;
      };
    } | null = null;

    const setupScrollEngine = async () => {
      if (cancelled || started) return;
      started = true;

      const [{ default: gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (cancelled) return;

      gsap.registerPlugin(ScrollTrigger);
      scrollTriggerRef.current = ScrollTrigger;
      activeGsap = gsap;

      if (!lenisEnabled) {
        nativeScrollListener = () => {
          ScrollTrigger.update();
          scrollListenersRef.current.forEach((listener) => listener());
        };
        window.addEventListener("scroll", nativeScrollListener, {
          passive: true,
        });
        return;
      }

      const { default: LenisCtor } = await import("lenis");
      if (cancelled) return;

      activeLenis = new LenisCtor({
        duration: 1.25,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        touchMultiplier: 1.5,
      });

      lenisRef.current = activeLenis;

      activeLenisScrollHandler = () => {
        ScrollTrigger.update();
        scrollListenersRef.current.forEach((listener) => listener());
      };
      activeLenis.on("scroll", activeLenisScrollHandler);

      activeTickerCallback = (time: number) => {
        activeLenis?.raf(time * 1000);
      };

      gsap.ticker.add(activeTickerCallback);
      gsap.ticker.lagSmoothing(0);
    };

    const onScrollIntent = () => {
      void setupScrollEngine();
    };
    window.addEventListener("wheel", onScrollIntent, {
      passive: true,
      once: true,
    });
    window.addEventListener("touchstart", onScrollIntent, {
      passive: true,
      once: true,
    });
    window.addEventListener("scroll", onScrollIntent, {
      passive: true,
      once: true,
    });

    let rafId = 0;
    const hashTimerId = window.location.hash
      ? window.setTimeout(() => {
          rafId = requestAnimationFrame(() => {
            if (window.scrollY > 0) void setupScrollEngine();
          });
        }, 480)
      : 0;

    return () => {
      cancelled = true;
      if (hashTimerId) window.clearTimeout(hashTimerId);
      if (rafId) cancelAnimationFrame(rafId);
      document.removeEventListener("click", handleAnchorClick);
      window.removeEventListener("wheel", onScrollIntent);
      window.removeEventListener("touchstart", onScrollIntent);
      window.removeEventListener("scroll", onScrollIntent);
      if (nativeScrollListener) {
        window.removeEventListener("scroll", nativeScrollListener);
      }
      if (activeTickerCallback && activeGsap) {
        activeGsap.ticker.remove(activeTickerCallback);
      }
      if (activeLenis && activeLenisScrollHandler) {
        activeLenis.off("scroll", activeLenisScrollHandler);
      }
      activeLenis?.destroy();
      lenisRef.current = null;
      scrollTriggerRef.current?.getAll().forEach((trigger) => trigger.kill());
      scrollTriggerRef.current = null;
    };
  }, [scrollTo, lenisEnabled]);

  return (
    <SmoothScrollContext.Provider
      value={{ scrollTo, refreshScroll, subscribeScroll }}
    >
      {children}
    </SmoothScrollContext.Provider>
  );
}
