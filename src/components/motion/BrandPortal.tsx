"use client";

import React, {
  createContext,
  useContext,
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { BrandPortalOrb } from "@/components/motion/BrandPortalOrb";
import { signExistingDeviceChallenge } from "@/lib/deviceTelemetry";
import { authenticateWithPasskey } from "@/lib/passkeyClient";
import {
  announceBrandPortalStatus,
  BrandPortalTone,
  DEVICE_STORAGE_KEY,
  DEVICE_SYNC_EVENT,
  dismissBrandPortalNotice,
} from "@/lib/brandPortalStatus";
import {
  queryKeys,
  writePersistedAdminCache,
} from "@/lib/queryClient";

interface BrandPortalContextValue {
  /**
   * Expands a radial wave pulse from the logo (just like the Dark/Light mode toggle)
   * across the entire viewport while loading the dashboard, then collapses in reverse
   * back to where the logo is.
   */
  triggerLoginPortal: (onMidpoint: () => void | Promise<void>) => void;
  /**
   * Smoothly slides across the viewport when navigating between
   * Public Portfolio ("left") and Portfolio Manager ("right").
   */
  triggerSlideNavigate: (href: string, direction?: "left" | "right") => void;
  /**
   * Animates the bottom-left Brand Portal orb to display a status update.
   */
  announceStatus: (input: {
    tone: BrandPortalTone;
    label: string;
    detail?: string;
    durationMs?: number;
  }) => number;
}

interface PendingSlideState {
  targetPath: string;
  direction: "left" | "right";
  exitToX: number;
  slideInComplete: boolean;
  routeReady: boolean;
  exited: boolean;
  fallbackTimer?: ReturnType<typeof setTimeout>;
}

const BrandPortalContext = createContext<BrandPortalContextValue>({
  triggerLoginPortal: (cb) => {
    void cb();
  },
  triggerSlideNavigate: () => {},
  announceStatus: announceBrandPortalStatus,
});

export function useBrandPortal() {
  return useContext(BrandPortalContext);
}

export function BrandPortalProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();

  const logoButtonRef = useRef<HTMLDivElement>(null);
  const portalOverlayRef = useRef<HTMLDivElement>(null);
  const slideOverlayRef = useRef<HTMLDivElement>(null);
  const slideLabelRef = useRef<HTMLDivElement>(null);
  const pendingSlideRef = useRef<PendingSlideState | null>(null);

  const isAnimatingRef = useRef(false);
  const greetingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isGreetingRef = useRef(false);
  const passkeyAvailableRef = useRef(false);
  const passkeyUnlockBusyRef = useRef(false);
  const triggerSlideNavigateRef = useRef<
    (href: string, direction?: "left" | "right") => void
  >(() => {});
  const handlePasskeyShortcutRef = useRef<
    (fallbackToAdminRoute: boolean) => Promise<void>
  >(async () => {});
  const [isAnimating, setIsAnimating] = useState(false);
  const [portalMode, setPortalMode] = useState<"idle" | "slide" | "wave">(
    "idle"
  );
  const [isRegisteredDevice, setIsRegisteredDevice] = useState(false);
  const [slideText, setSlideText] = useState("PORTFOLIO");

  const isAdminRoute = Boolean(pathname?.startsWith("/admin"));

  // Prefetch the reciprocal route only when on /admin or on a recognized admin device
  useEffect(() => {
    if (isAdminRoute) {
      router.prefetch("/");
    } else if (isRegisteredDevice) {
      router.prefetch("/admin");
    }
  }, [router, isAdminRoute, isRegisteredDevice]);

  // Keep Next.js DevTools floating toast/issues pill strictly contained inside the 36x36 footprint in dev mode
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      process.env.NODE_ENV !== "development"
    ) {
      return;
    }

    const containNextJsPortalPill = () => {
      const portals = document.querySelectorAll("nextjs-portal");
      portals.forEach((portal) => {
        const sr = portal.shadowRoot;
        if (!sr || sr.querySelector("#lou-portal-pill-clamp")) return;
        const style = document.createElement("style");
        style.id = "lou-portal-pill-clamp";
        style.textContent = `
          [data-nextjs-toast],
          [data-next-badge-root],
          [data-nextjs-dev-tools-button],
          .nextjs-toast {
            max-width: 36px !important;
            max-height: 36px !important;
            width: 36px !important;
            height: 36px !important;
            border-radius: 9999px !important;
            overflow: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
          }
        `;
        sr.appendChild(style);
      });
    };

    containNextJsPortalPill();
    const observer = new MutationObserver(containNextJsPortalPill);
    observer.observe(document.body, { childList: true });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const cached =
      typeof window !== "undefined" &&
      localStorage.getItem(DEVICE_STORAGE_KEY) === "true";

    const rafId = requestAnimationFrame(() => {
      if (cached) {
        setIsRegisteredDevice(true);
      }
    });

    let authTimerId: ReturnType<typeof setTimeout> | null = null;
    let retryTimerId: ReturnType<typeof setTimeout> | null = null;
    let idleCallbackId: number | null = null;
    let cancelled = false;
    let inFlight = false;
    let lastCheckedAt = 0;
    let lastCheckSucceeded = false;
    const RETRY_DELAYS_MS = [1000, 3000, 8000] as const;

    const scheduleRetry = (attempt: number) => {
      if (cancelled || attempt >= RETRY_DELAYS_MS.length) return;
      if (retryTimerId !== null) clearTimeout(retryTimerId);
      retryTimerId = setTimeout(() => {
        retryTimerId = null;
        void verifyAdminDeviceStatus(attempt + 1);
      }, RETRY_DELAYS_MS[attempt]);
    };

    const verifyAdminDeviceStatus = async (retryAttempt = 0) => {
      if (cancelled || inFlight) return;
      inFlight = true;
      lastCheckedAt = Date.now();
      try {
        const res = await fetch("/api/admin/auth", { cache: "no-store" });
        if (!res.ok) {
          // Never wipe persisted device trust on transient network/503 responses; retry with backoff
          lastCheckSucceeded = false;
          scheduleRetry(retryAttempt);
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        lastCheckSucceeded = true;
        passkeyAvailableRef.current = Boolean(data.passkeyAvailable);

        let verified = Boolean(data.deviceRegistered || data.authenticated);
        let recoveredFromHardwareKey = false;

        // If the httpOnly device cookie dropped but IndexedDB still holds a trusted ECDSA keypair,
        // cryptographically prove ownership to restore `lou_registered_device` seamlessly.
        if (!verified && typeof data.deviceChallenge === "string" && data.deviceChallenge) {
          const assertion = await signExistingDeviceChallenge(data.deviceChallenge);
          if (!cancelled && assertion) {
            const recRes = await fetch("/api/admin/auth", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "recover-device-trust",
                challenge: data.deviceChallenge,
                keyThumbprint: assertion.keyThumbprint,
                signature: assertion.signature,
              }),
            });
            if (recRes.ok) {
              const recData = await recRes.json().catch(() => ({}));
              if (recData?.deviceRegistered) {
                verified = true;
                recoveredFromHardwareKey = true;
              }
            }
          }
        }

        if (cancelled) return;
        setIsRegisteredDevice(verified);
        if (verified) {
          localStorage.setItem(DEVICE_STORAGE_KEY, "true");
        } else {
          localStorage.removeItem(DEVICE_STORAGE_KEY);
        }
        window.dispatchEvent(
          new CustomEvent(DEVICE_SYNC_EVENT, { detail: verified })
        );

        // Seed TanStack Query cache ONLY when authenticated (or sync updated deviceRegistered flag
        // when cache already exists), so SSR `initialAuth` remains authoritative on /admin entry.
        if (data.authenticated) {
          queryClient.setQueryData(queryKeys.adminAuth, {
            authenticated: true,
            deviceRegistered: verified,
            storageMode: data.storageMode || "local-json",
            passwordSource: data.passwordSource,
            envConfigured: data.envConfigured,
            overrideUpdatedAt: data.overrideUpdatedAt ?? null,
          });
        } else {
          queryClient.setQueryData(
            queryKeys.adminAuth,
            (prev: Record<string, unknown> | undefined) =>
              prev
                ? { ...prev, authenticated: false, deviceRegistered: verified }
                : prev
          );
        }

        if (recoveredFromHardwareKey) {
          router.refresh();
        }

        // If already authenticated on this device, warm the admin DB cache in the background
        if (data.authenticated) {
          void queryClient.prefetchQuery({
            queryKey: queryKeys.adminPortfolio,
            queryFn: async () => {
              const portfolioRes = await fetch("/api/admin/portfolio", {
                cache: "no-store",
              });
              if (!portfolioRes.ok) throw new Error("Failed to prefetch admin DB");
              const payload = await portfolioRes.json();
              writePersistedAdminCache(payload);
              return payload;
            },
          });
        }
      } catch {
        // Keep last known local device state across transient connectivity drops and schedule retry
        lastCheckSucceeded = false;
        scheduleRetry(retryAttempt);
      } finally {
        inFlight = false;
      }
    };

    if (isAdminRoute || cached) {
      void verifyAdminDeviceStatus();
    } else if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleCallbackId = window.requestIdleCallback(
        () => {
          void verifyAdminDeviceStatus();
        },
        { timeout: 450 }
      );
    } else {
      authTimerId = setTimeout(() => {
        void verifyAdminDeviceStatus();
      }, 250);
    }

    const handleVisibilityOrFocus = () => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        return;
      }
      const minIntervalMs = lastCheckSucceeded ? 60_000 : 5_000;
      if (Date.now() - lastCheckedAt < minIntervalMs) return;
      void verifyAdminDeviceStatus();
    };

    const handleOnline = () => {
      void verifyAdminDeviceStatus();
    };

    const handleDeviceSync = (e: Event) => {
      const custom = e as CustomEvent<boolean>;
      setIsRegisteredDevice(Boolean(custom.detail));
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "a"
      ) {
        e.preventDefault();
        void handlePasskeyShortcutRef.current(true);
      }
    };

    window.addEventListener(DEVICE_SYNC_EVENT, handleDeviceSync);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("focus", handleVisibilityOrFocus);
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      if (authTimerId !== null) clearTimeout(authTimerId);
      if (retryTimerId !== null) clearTimeout(retryTimerId);
      if (greetingTimerRef.current !== null) {
        clearTimeout(greetingTimerRef.current);
        greetingTimerRef.current = null;
      }
      if (
        idleCallbackId !== null &&
        typeof window !== "undefined" &&
        "cancelIdleCallback" in window
      ) {
        window.cancelIdleCallback(idleCallbackId);
      }
      window.removeEventListener(DEVICE_SYNC_EVENT, handleDeviceSync);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [router, queryClient, isAdminRoute]);

  /**
   * Executes the exit phase of the slide curtain once BOTH:
   * 1. The curtain has finished covering the viewport (slideInComplete)
   * 2. The target Next.js route has mounted and painted underneath (routeReady)
   */
  const tryCompleteSlideExit = useCallback(() => {
    const pending = pendingSlideRef.current;
    if (
      !pending ||
      pending.exited ||
      !pending.slideInComplete ||
      !pending.routeReady
    ) {
      return;
    }

    pending.exited = true;
    if (pending.fallbackTimer) {
      clearTimeout(pending.fallbackTimer);
    }

    const slideEl = slideOverlayRef.current;
    const labelEl = slideLabelRef.current;

    if (!slideEl || !labelEl) {
      pendingSlideRef.current = null;
      isAnimatingRef.current = false;
      setIsAnimating(false);
      setPortalMode("idle");
      return;
    }

    // Wait 2 animation frames so the new route DOM is fully painted behind the curtain
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void import("gsap").then(({ default: gsap }) => {
          gsap
            .timeline({
              onComplete: () => {
                gsap.set(slideEl, { autoAlpha: 0, pointerEvents: "none" });
                pendingSlideRef.current = null;
                isAnimatingRef.current = false;
                setIsAnimating(false);
                setPortalMode("idle");
              },
            })
            .to(labelEl, {
              autoAlpha: 0,
              x: pending.direction === "right" ? -24 : 24,
              duration: 0.18,
              ease: "power2.in",
            })
            .to(
              slideEl,
              {
                xPercent: pending.exitToX,
                duration: 0.48,
                ease: "expo.inOut",
              },
              "-=0.08"
            );
        });
      });
    });
  }, []);

  // Watch pathname changes to detect when Next.js finishes route navigation
  useEffect(() => {
    const pending = pendingSlideRef.current;
    if (!pending || pending.exited) return;

    const matchesTarget =
      pending.targetPath === "/"
        ? pathname === "/"
        : pathname?.startsWith(pending.targetPath);

    if (!matchesTarget) return;

    if (!pending.targetPath.startsWith("/admin")) {
      pending.routeReady = true;
      tryCompleteSlideExit();
    } else if (typeof window !== "undefined") {
      // Once /admin pathname activates, ask mounted AdminDashboardClient to confirm readiness
      const rafId = requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent("lou-check-admin-ready"));
      });
      return () => cancelAnimationFrame(rafId);
    }
  }, [pathname, tryCompleteSlideExit]);

  // Listen for /admin finishing its initial auth & DB readiness check
  useEffect(() => {
    const handleAdminReady = () => {
      const pending = pendingSlideRef.current;
      if (!pending || pending.exited) return;
      if (
        pending.targetPath.startsWith("/admin") &&
        typeof window !== "undefined" &&
        window.location.pathname.startsWith("/admin")
      ) {
        pending.routeReady = true;
        tryCompleteSlideExit();
      }
    };

    window.addEventListener("lou-admin-ready", handleAdminReady);
    return () => {
      window.removeEventListener("lou-admin-ready", handleAdminReady);
    };
  }, [tryCompleteSlideExit]);

  /**
   * Spawns the glowing radial shockwave ring identical to ThemeToggle.tsx,
   * supporting both "expand" (0 -> maxRadius) and "collapse" (maxRadius -> 0).
   */
  const spawnPulseWaveRing = useCallback(
    (
      cx: number,
      cy: number,
      maxRadius: number,
      mode: "expand" | "collapse",
      durationMs = 720
    ) => {
      const wave = document.createElement("div");
      const diameter = maxRadius * 2;
      wave.style.position = "fixed";
      wave.style.left = `${cx}px`;
      wave.style.top = `${cy}px`;
      wave.style.width = `${diameter}px`;
      wave.style.height = `${diameter}px`;
      wave.style.borderRadius = "9999px";
      wave.style.pointerEvents = "none";
      wave.style.zIndex = "10000";
      wave.style.border = "2px solid var(--accent)";
      wave.style.boxShadow =
        "0 0 60px var(--accent-glow), inset 0 0 45px var(--accent-ring)";
      wave.style.willChange = "transform, opacity";

      document.body.appendChild(wave);

      const keyframes =
        mode === "expand"
          ? [
              {
                transform: "translate(-50%, -50%) scale(0)",
                opacity: 1,
              },
              {
                transform: "translate(-50%, -50%) scale(1)",
                opacity: 0.15,
              },
            ]
          : [
              {
                transform: "translate(-50%, -50%) scale(1)",
                opacity: 0.25,
              },
              {
                transform: "translate(-50%, -50%) scale(0)",
                opacity: 1,
              },
            ];

      const anim = wave.animate(keyframes, {
        duration: durationMs,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "forwards",
      });

      anim.onfinish = () => {
        wave.remove();
      };
    },
    []
  );

  const triggerLoginPortal = useCallback(
    (onMidpoint: () => void | Promise<void>) => {
      if (isAnimating) return;

      const overlay = portalOverlayRef.current;
      const logoBtn = logoButtonRef.current;

      if (!overlay || !logoBtn) {
        void onMidpoint();
        return;
      }

      isAnimatingRef.current = true;
      setIsAnimating(true);
      setPortalMode("wave");

      const rect = logoBtn.getBoundingClientRect();
      const originX = Math.round(rect.left + rect.width / 2);
      const originY = Math.round(rect.top + rect.height / 2);
      const startRadius = Math.round(rect.width / 2);
      const maxRadius = Math.ceil(
        Math.hypot(
          Math.max(originX, window.innerWidth - originX),
          Math.max(originY, window.innerHeight - originY)
        ) + 30
      );

      void import("gsap").then(({ default: gsap }) => {
        gsap.set(overlay, {
          autoAlpha: 1,
          pointerEvents: "auto",
          clipPath: `circle(${startRadius}px at ${originX}px ${originY}px)`,
        });

        // 1. Fire expanding shockwave pulse ring (just like ThemeToggle)
        spawnPulseWaveRing(originX, originY, maxRadius, "expand", 680);

        // 2. Expand wave cover from logo across the entire viewport
        const expandTl = gsap.timeline();

        expandTl
          .to(logoBtn, {
            scale: 1.28,
            duration: 0.2,
            ease: "power2.out",
          })
          .to(
            overlay,
            {
              clipPath: `circle(${maxRadius}px at ${originX}px ${originY}px)`,
              duration: 0.68,
              ease: "expo.inOut",
            },
            0
          )
          .add(() => {
            // 3. Load dashboard while viewport is covered by the wave
            Promise.resolve(onMidpoint()).finally(() => {
              const nextRect = logoBtn.getBoundingClientRect();
              const targetX = Math.round(nextRect.left + nextRect.width / 2);
              const targetY = Math.round(nextRect.top + nextRect.height / 2);
              const endRadius = Math.round(nextRect.width / 2);

              // 4. Fire reverse collapsing shockwave pulse ring back to the logo
              spawnPulseWaveRing(targetX, targetY, maxRadius, "collapse", 680);

              gsap
                .timeline({
                  onComplete: () => {
                    gsap.set(overlay, { autoAlpha: 0, pointerEvents: "none" });
                    gsap.set(logoBtn, { scale: 1 });
                    isAnimatingRef.current = false;
                    setIsAnimating(false);
                    setPortalMode("idle");
                  },
                })
                .to(overlay, {
                  clipPath: `circle(${endRadius}px at ${targetX}px ${targetY}px)`,
                  duration: 0.68,
                  ease: "expo.inOut",
                })
                .to(
                  logoBtn,
                  {
                    scale: 1,
                    duration: 0.35,
                    ease: "elastic.out(1, 0.45)",
                  },
                  "-=0.22"
                );
            });
          });
      });
    },
    [isAnimating, spawnPulseWaveRing]
  );

  const triggerSlideNavigate = useCallback(
    (href: string, direction: "left" | "right" = "right") => {
      const targetPath = href.split("?")[0].split("#")[0] || "/";
      if (isAnimatingRef.current || isAnimating || pathname === targetPath) {
        router.push(href);
        return;
      }

      // Warm Next.js Router & RSC payload immediately while curtain starts closing
      router.prefetch(href);

      const slideEl = slideOverlayRef.current;
      const labelEl = slideLabelRef.current;

      if (!slideEl || !labelEl) {
        router.push(href);
        return;
      }

      isAnimatingRef.current = true;
      setIsAnimating(true);
      setPortalMode("slide");
      setSlideText(
        targetPath.startsWith("/admin")
          ? "WELCOME ADMIN // CMS"
          : "PUBLIC PORTFOLIO // LIVE"
      );

      // "right" (going to Admin) slides in from right (100% -> 0% -> -100%)
      // "left" (Back to Public Portfolio) slides in from left (-100% -> 0% -> 100%)
      const enterFromX = direction === "right" ? 100 : -100;
      const exitToX = direction === "right" ? -100 : 100;

      const state: PendingSlideState = {
        targetPath,
        direction,
        exitToX,
        slideInComplete: false,
        routeReady: false,
        exited: false,
      };

      // Safety fallback in case navigation stalls unexpectedly
      state.fallbackTimer = setTimeout(() => {
        if (pendingSlideRef.current === state && !state.exited) {
          state.routeReady = true;
          tryCompleteSlideExit();
        }
      }, 6000);

      pendingSlideRef.current = state;

      void import("gsap").then(({ default: gsap }) => {
        gsap.killTweensOf([slideEl, labelEl]);
        gsap.set(slideEl, {
          autoAlpha: 1,
          pointerEvents: "auto",
          xPercent: enterFromX,
        });

        gsap.set(labelEl, {
          autoAlpha: 0,
          x: direction === "right" ? 32 : -32,
        });

        // Cover 100% of the viewport first (`xPercent: 0`) BEFORE swapping routes so neither route ever flashes through
        gsap
          .timeline({
            onComplete: () => {
              state.slideInComplete = true;
              tryCompleteSlideExit();
            },
          })
          .to(slideEl, {
            xPercent: 0,
            duration: 0.38,
            ease: "expo.inOut",
            onComplete: () => {
              // Dismiss the transient portal greeting behind the opaque curtain so mobile
              // transitions smoothly into /admin with no lingering orb capsule over the dock.
              dismissBrandPortalNotice();
              router.push(href);
              if (targetPath.startsWith("/admin")) {
                window.dispatchEvent(new CustomEvent("lou-check-admin-ready"));
              }
            },
          })
          .to(
            labelEl,
            {
              autoAlpha: 1,
              x: 0,
              duration: 0.2,
              ease: "power3.out",
            },
            "-=0.2"
          );
      });
    },
    [isAnimating, pathname, router, tryCompleteSlideExit]
  );

  useEffect(() => {
    triggerSlideNavigateRef.current = triggerSlideNavigate;
  }, [triggerSlideNavigate]);

  const handleOrbAction = useCallback(() => {
    if (isAnimating || isGreetingRef.current || !isRegisteredDevice) return;

    if (isAdminRoute) {
      triggerSlideNavigate("/", "left");
      return;
    }

    // Expand the orb pill to greet the admin on mobile/desktop before sweeping the slide curtain
    isGreetingRef.current = true;
    announceBrandPortalStatus({
      tone: "live",
      label: "Welcome Admin",
      detail: "Opening Portfolio CMS...",
      durationMs: 2200,
    });

    if (greetingTimerRef.current !== null) {
      clearTimeout(greetingTimerRef.current);
    }
    greetingTimerRef.current = setTimeout(() => {
      greetingTimerRef.current = null;
      isGreetingRef.current = false;
      triggerSlideNavigateRef.current("/admin", "right");
    }, 420);
  }, [isAnimating, isRegisteredDevice, isAdminRoute, triggerSlideNavigate]);

  const handlePasskeyUnlock = useCallback(
    async (fallbackToAdminRoute: boolean) => {
      if (isAnimating || isGreetingRef.current || passkeyUnlockBusyRef.current) {
        return;
      }

      if (isAdminRoute) {
        triggerSlideNavigate("/", "left");
        return;
      }

      if (isRegisteredDevice) {
        handleOrbAction();
        return;
      }

      if (!passkeyAvailableRef.current && fallbackToAdminRoute) {
        triggerSlideNavigateRef.current("/admin", "right");
        return;
      }

      passkeyUnlockBusyRef.current = true;
      try {
        const result = await authenticateWithPasskey();
        if (result.ok) {
          setIsRegisteredDevice(true);
          announceBrandPortalStatus({
            tone: "live",
            label: "Welcome Admin",
            detail: `${result.authenticatorLabel} · Opening CMS...`,
            durationMs: 2200,
          });
          triggerSlideNavigateRef.current("/admin", "right");
          return;
        }

        if (fallbackToAdminRoute) {
          triggerSlideNavigateRef.current("/admin", "right");
        }
      } finally {
        passkeyUnlockBusyRef.current = false;
      }
    },
    [isAnimating, isAdminRoute, isRegisteredDevice, triggerSlideNavigate, handleOrbAction]
  );

  useEffect(() => {
    handlePasskeyShortcutRef.current = handlePasskeyUnlock;
  }, [handlePasskeyUnlock]);

  const handleOrbLongPress = useCallback(() => {
    void handlePasskeyUnlock(false);
  }, [handlePasskeyUnlock]);

  const contextValue = useMemo<BrandPortalContextValue>(
    () => ({
      triggerLoginPortal,
      triggerSlideNavigate,
      announceStatus: announceBrandPortalStatus,
    }),
    [triggerLoginPortal, triggerSlideNavigate]
  );

  return (
    <BrandPortalContext.Provider value={contextValue}>
      {children}

      {/* Persistent Bottom-Left Brand Portal Orb & Animated Status Pill */}
      <BrandPortalOrb
        logoButtonRef={logoButtonRef}
        isAdminRoute={isAdminRoute}
        isRegisteredDevice={isRegisteredDevice}
        isAnimating={isAnimating}
        isSlideTransition={portalMode === "slide"}
        onOrbAction={handleOrbAction}
        onOrbLongPress={handleOrbLongPress}
      />

      {/* Radial Wave Pulse Overlay (Expands from Logo across Viewport, then Collapses Reverse back to Logo) */}
      <div
        ref={portalOverlayRef}
        aria-hidden="true"
        className="fixed inset-0 bg-(--bg-canvas) opacity-0 pointer-events-none will-change-[clip-path]"
        style={{
          zIndex: 9994,
          backgroundImage:
            "radial-gradient(circle at 40px calc(100vh - 40px), var(--accent-glow) 0%, var(--bg-badge-highlight) 38%, transparent 70%)",
        }}
      />

      {/* Smooth Directional Slide Curtain Overlay (Public <-> Portfolio Manager) */}
      <div
        ref={slideOverlayRef}
        aria-hidden="true"
        style={{ zIndex: 9993 }}
        className="fixed inset-0 bg-(--bg-canvas) border-x-2 border-brand flex items-center justify-center opacity-0 pointer-events-none will-change-transform"
      >
        <div
          ref={slideLabelRef}
          className="flex items-center gap-3 px-5 py-2.5 rounded-full bg-(--bg-surface) border border-(--border-strong) shadow-2xl select-none"
        >
          <span className="w-2 h-2 rounded-full bg-brand animate-ping" />
          <span className="font-mono text-xs uppercase tracking-[0.26em] text-(--text-primary)">
            {slideText}
          </span>
        </div>
      </div>
    </BrandPortalContext.Provider>
  );
}
