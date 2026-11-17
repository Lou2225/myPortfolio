"use client";

import {
  AlertTriangle,
  ArrowDownRight,
  CheckCircle2,
  WifiOff,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

interface AdminAlertBannerProps {
  variant: "offline" | "error" | "success";
  message: string;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
}

/**
 * Reusable theme-aware alert strip for /admin workspace offline guards,
 * persistence/upload errors, confirmation feedback, and one-click validation following.
 */
export function AdminAlertBanner({
  variant,
  message,
  detail,
  actionLabel,
  onAction,
  onDismiss,
}: AdminAlertBannerProps) {
  const isOffline = variant === "offline";
  const isSuccess = variant === "success";

  return (
    <div
      role="alert"
      className={`rounded-(--radius-control) border px-3.5 sm:px-4 py-2.5 sm:py-3 text-xs font-mono flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 ${
        isOffline
          ? "border-amber-500/45 bg-amber-500/12 text-(--text-primary)"
          : isSuccess
            ? "border-emerald-500/40 bg-emerald-500/10 text-(--text-primary)"
            : "border-brand/45 bg-(--bg-badge-highlight) text-(--text-primary)"
      }`}
    >
      <span className="flex items-center gap-2.5 min-w-0">
        {isOffline ? (
          <WifiOff className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
        ) : isSuccess ? (
          <CheckCircle2
            className="w-4 h-4 text-emerald-400 shrink-0"
            aria-hidden="true"
          />
        ) : (
          <AlertTriangle
            className="w-4 h-4 text-(--text-accent) shrink-0"
            aria-hidden="true"
          />
        )}
        <span>
          <strong
            className={
              isOffline
                ? "text-amber-500"
                : isSuccess
                  ? "text-emerald-400"
                  : "text-(--text-accent)"
            }
          >
            {message}
          </strong>
          {detail ? ` ${detail}` : ""}
        </span>
      </span>

      <div className="flex items-center gap-2 shrink-0">
        {onAction && actionLabel && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAction}
            className="h-7.5 px-3 text-[10px] font-mono border-brand/45 text-(--text-accent)"
          >
            <span>{actionLabel}</span>
            <ArrowDownRight className="w-3 h-3" aria-hidden="true" />
          </Button>
        )}

        {onDismiss && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onDismiss}
            aria-label="Dismiss notification"
            className="h-7 w-7"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
}
