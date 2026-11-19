"use client";

import { useEffect, useState } from "react";
import { AdminLogin } from "@/components/admin/AdminLogin";
import { DEVICE_SYNC_EVENT } from "@/lib/brandPortalStatus";

/**
 * Neutral 404 boundary for `/admin` when Stealth Gate is active.
 * Presents an indistinguishable standard 404 to unauthorized visitors while:
 * 1. Seamlessly reloading into `/admin` as soon as silent WebCrypto ECDSA or
 *    cross-browser physical device recognition restores `lou_registered_device`.
 * 2. Allowing the owner to press `Ctrl+Shift+A` (or click the `404` code) to
 *    open the Admin Login / Passkey gate directly so they are never locked out.
 */
export default function AdminNotFound() {
  const [manualUnlockOpen, setManualUnlockOpen] = useState(false);

  useEffect(() => {
    const handleDeviceRecovered = (e: Event) => {
      const custom = e as CustomEvent<boolean>;
      if (custom.detail === true) {
        window.location.replace(
          window.location.pathname + window.location.search
        );
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "a"
      ) {
        e.preventDefault();
        setManualUnlockOpen(true);
      }
    };

    window.addEventListener(DEVICE_SYNC_EVENT, handleDeviceRecovered);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener(DEVICE_SYNC_EVENT, handleDeviceRecovered);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  if (manualUnlockOpen) {
    return (
      <AdminLogin
        onSuccess={() => {
          window.location.replace(
            window.location.pathname + window.location.search
          );
        }}
      />
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-(--bg-canvas) text-(--text-primary) select-none">
      <div className="flex items-center gap-5">
        <h1
          onClick={() => setManualUnlockOpen(true)}
          title="404"
          className="font-mono text-2xl font-semibold tracking-tight text-(--text-primary) pr-5 border-r border-(--border-subtle) cursor-default"
        >
          404
        </h1>
        <p className="text-sm text-(--text-secondary)">
          This page could not be found.
        </p>
      </div>
    </main>
  );
}
