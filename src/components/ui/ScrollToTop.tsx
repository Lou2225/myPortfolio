"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import { ArrowUp } from "lucide-react";
import { useSmoothScroll } from "@/components/motion/SmoothScroll";
import { Magnetic } from "@/components/motion/Magnetic";
import { useBrandPortalStatus } from "@/lib/brandPortalStatus";
import { cn } from "@/lib/utils";

export interface ScrollToTopProps {
  variant?: "floating" | "inline";
  threshold?: number;
  label?: string;
  showOnAdmin?: boolean;
  className?: string;
}

const RING_RADIUS = 20;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function ScrollToTop({
  variant = "floating",
  threshold = 240,
  label = "Back to Top",
  showOnAdmin = false,
  className,
}: ScrollToTopProps) {
  const pathname = usePathname();
  const { scrollTo, subscribeScroll } = useSmoothScroll();
  const { workspace, notice } = useBrandPortalStatus();
  const [visible, setVisible] = useState(false);
  const progressCircleRef = useRef<SVGCircleElement>(null);

  const isAdminRoute = pathname?.startsWith("/admin");
  const hideForMobileBrandPortal =
    Boolean(isAdminRoute) &&
    Boolean(
      notice ||
        workspace.hasUnsavedChanges ||
        workspace.saving ||
        workspace.validationErrorCount > 0
    );

  const handleScroll = useCallback(() => {
    const scrollY = window.scrollY;
    setVisible(scrollY > threshold);

    if (scrollY <= 0) {
      if (progressCircleRef.current) {
        progressCircleRef.current.style.strokeDashoffset = `${RING_CIRCUMFERENCE}`;
      }
      return;
    }

    const docHeight =
      document.documentElement.scrollHeight - window.innerHeight;
    const progress =
      docHeight > 0 ? Math.min(1, Math.max(0, scrollY / docHeight)) : 0;

    // Directly mutate strokeDashoffset on the SVG circle ref for instant 120fps live tracking
    if (progressCircleRef.current) {
      const offset = RING_CIRCUMFERENCE - progress * RING_CIRCUMFERENCE;
      progressCircleRef.current.style.strokeDashoffset = `${offset}`;
    }
  }, [threshold]);

  useEffect(() => {
    if (variant !== "floating") return;
    let rafId = 0;
    const hashTimerId = window.location.hash
      ? window.setTimeout(() => {
          rafId = requestAnimationFrame(() => {
            if (window.scrollY > 0) handleScroll();
          });
        }, 120)
      : 0;
    const unsubscribeLenis = subscribeScroll(handleScroll);
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll, { passive: true });
    return () => {
      if (hashTimerId) window.clearTimeout(hashTimerId);
      if (rafId) cancelAnimationFrame(rafId);
      unsubscribeLenis();
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [variant, handleScroll, subscribeScroll]);

  if (isAdminRoute && !showOnAdmin && variant === "floating") {
    return null;
  }

  const handleScrollToTop = () => {
    scrollTo(isAdminRoute ? 0 : "#top", {
      offset: 0,
      duration: isAdminRoute ? 1.0 : 1.4,
    });
    if (!isAdminRoute && window.history.pushState) {
      window.history.pushState(null, "", "#top");
    }
  };

  if (variant === "inline") {
    return (
      <Magnetic strength={0.2}>
        <button
          type="button"
          onClick={handleScrollToTop}
          aria-label={label}
          className={cn(
            "h-8.5 px-4 rounded-full border border-(--border-strong) hover:border-brand text-(--text-primary) hover:text-(--text-accent) active:scale-95 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] transition-all duration-300 cursor-pointer select-none",
            className
          )}
        >
          <span>{label}</span>
          <ArrowUp className="w-3.5 h-3.5 text-(--text-accent)" />
        </button>
      </Magnetic>
    );
  }

  return (
    <div
      className={cn(
        "fixed transition-all duration-500 ease-out",
        className ||
          (isAdminRoute
            ? "bottom-22 right-4 md:bottom-8 md:right-8 z-30"
            : "bottom-4 right-4 sm:bottom-8 sm:right-8 z-40"),
        visible
          ? hideForMobileBrandPortal
            ? "opacity-0 md:opacity-100 translate-y-4 md:translate-y-0 pointer-events-none md:pointer-events-auto"
            : "opacity-100 translate-y-0 pointer-events-auto"
          : "opacity-0 translate-y-6 pointer-events-none"
      )}
    >
      <Magnetic strength={0.25}>
        <button
          type="button"
          onClick={handleScrollToTop}
          aria-label="Scroll back to top"
          title="Scroll back to top"
          className={cn(
            "relative w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-(--bg-surface) border border-(--border-strong) hover:border-brand text-(--text-primary) hover:text-(--text-accent) shadow-lg flex items-center justify-center cursor-pointer group active:scale-95 transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
            visible && "backdrop-blur-xl"
          )}
        >
          {/* Live SVG Scroll Progress Ring (Zero-Lag Direct Ref Update) */}
          <svg
            aria-hidden="true"
            className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none"
            viewBox="0 0 48 48"
          >
            <circle
              cx="24"
              cy="24"
              r={RING_RADIUS}
              fill="none"
              stroke="var(--border-subtle)"
              strokeWidth="1.5"
            />
            <circle
              ref={progressCircleRef}
              cx="24"
              cy="24"
              r={RING_RADIUS}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={RING_CIRCUMFERENCE}
            />
          </svg>

          <ArrowUp className="w-4 h-4 text-(--text-accent) group-hover:-translate-y-0.5 transition-transform duration-300" />
        </button>
      </Magnetic>
    </div>
  );
}
