"use client";

import { useEffect } from "react";
import { DEVICE_SYNC_EVENT } from "@/lib/brandPortalStatus";

/**
 * Neutral 404 boundary for `/admin` when Stealth Gate is active.
 * Presents an indistinguishable standard 404 to unauthorized visitors while
 * seamlessly reloading into `/admin` if silent WebCrypto ECDSA device recovery
 * restores the `lou_registered_device` cookie in the background.
 */
export default function AdminNotFound() {
  useEffect(() => {
    const handleDeviceRecovered = (e: Event) => {
      const custom = e as CustomEvent<boolean>;
      if (custom.detail === true) {
        window.location.replace(
          window.location.pathname + window.location.search
        );
      }
    };

    window.addEventListener(DEVICE_SYNC_EVENT, handleDeviceRecovered);
    return () => {
      window.removeEventListener(DEVICE_SYNC_EVENT, handleDeviceRecovered);
    };
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-(--bg-canvas) text-(--text-primary) select-none">
      <div className="flex items-center gap-5">
        <h1 className="font-mono text-2xl font-semibold tracking-tight text-(--text-primary) pr-5 border-r border-(--border-subtle)">
          404
        </h1>
        <p className="text-sm text-(--text-secondary)">
          This page could not be found.
        </p>
      </div>
    </main>
  );
}
