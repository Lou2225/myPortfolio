"use client";

import { RefreshCw, WifiOff, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * Editorial offline fallback screen rendered when an uncached route or live
 * network-only admin/API route is requested without connectivity.
 */
export default function OfflinePage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-28 bg-(--bg-canvas) text-(--text-primary)">
      <div className="max-w-xl w-full rounded-3xl border border-(--border-subtle) bg-(--bg-surface) p-8 md:p-10 shadow-(--shadow-card)">
        <div className="inline-flex items-center gap-2 rounded-full border border-(--border-subtle) bg-(--bg-badge-highlight) px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-(--text-accent)">
          <WifiOff className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Network // Offline Mode</span>
        </div>

        <h1 className="mt-6 font-display text-4xl md:text-5xl uppercase tracking-tight text-(--text-primary)">
          You&apos;re Offline
        </h1>

        <p className="mt-4 text-sm md:text-base leading-relaxed text-(--text-secondary)">
          This page requires an active internet connection or has not been saved
          to your browser&apos;s offline cache yet. You can still browse any
          previously cached sections of the portfolio, while CMS admin edits
          remain online-only to keep your database synchronized.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="primary"
            size="lg"
            shape="pill"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Retry Connection</span>
          </Button>

          <Button
            href="/"
            variant="secondary"
            size="lg"
            shape="pill"
            slideDirection="left"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Cached Portfolio</span>
          </Button>
        </div>
      </div>
    </main>
  );
}
