"use client";

import React, { useState } from "react";
import {
  Cpu,
  Laptop,
  Loader2,
  Smartphone,
  X,
} from "lucide-react";
import { ModalShell } from "@/components/ui/ModalShell";
import { TextField } from "@/components/ui/fields";
import { Button } from "@/components/ui/Button";
import { sanitizeDeviceLabel } from "@/lib/validation";
import type { ClientDeviceTelemetry, TrustedDevice } from "@/types/security";

export interface DeviceEditModalProps {
  open: boolean;
  mode: "register" | "edit";
  targetDevice: TrustedDevice | null;
  liveTelemetry: ClientDeviceTelemetry | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: { name: string }) => Promise<void>;
}

/**
 * Modal for inspecting automatically detected hardware/cryptographic telemetry
 * and editing a device's friendly label.
 */
export function DeviceEditModal({
  open,
  mode,
  targetDevice,
  liveTelemetry,
  saving,
  onClose,
  onSubmit,
}: DeviceEditModalProps) {
  const [name, setName] = useState("");
  const [prevOpen, setPrevOpen] = useState(false);
  const [prevTargetId, setPrevTargetId] = useState<string | null>(null);

  // Store information from previous renders to initialize form when opened or target changes
  if (open && (!prevOpen || (targetDevice?.id ?? null) !== prevTargetId)) {
    setPrevOpen(true);
    setPrevTargetId(targetDevice?.id ?? null);
    setName(targetDevice?.name || liveTelemetry?.suggestedName || "");
  } else if (!open && prevOpen) {
    setPrevOpen(false);
  }

  const model = targetDevice?.model || liveTelemetry?.model || "Browser Device";
  const platform =
    targetDevice?.platform || liveTelemetry?.platform || "Unknown OS";
  const osVersion =
    targetDevice?.osVersion || liveTelemetry?.osVersion || "";
  const browser =
    targetDevice?.browser || liveTelemetry?.browser || "Unknown Browser";
  const architecture =
    targetDevice?.architecture || liveTelemetry?.architecture || null;
  const cpuCores = targetDevice?.cpuCores || liveTelemetry?.cpuCores || null;
  const gpuRenderer =
    targetDevice?.gpuRenderer || liveTelemetry?.gpuRenderer || null;
  const screenMetrics =
    targetDevice?.screenMetrics || liveTelemetry?.screenMetrics || null;
  const thumbprint =
    targetDevice?.keyThumbprint || liveTelemetry?.keyThumbprint || null;
  const deviceType =
    targetDevice?.deviceType || liveTelemetry?.deviceType || "desktop";

  const canSubmit = name.trim().length >= 2 && !saving;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    await onSubmit({
      name: sanitizeDeviceLabel(name, 60).trim(),
    });
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      closeDisabled={saving}
      ariaLabelledBy="device-edit-modal-title"
      maxWidthClassName="max-w-lg"
    >
      <form
        onSubmit={handleSave}
        className="flex flex-col flex-1 min-h-0 overflow-hidden"
      >
        <div className="px-4 sm:px-6 py-4 border-b border-(--border-subtle) flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-(--radius-control) bg-(--bg-badge-highlight) border border-brand/40 flex items-center justify-center shrink-0 text-(--text-accent)">
              {deviceType === "mobile" || deviceType === "tablet" ? (
                <Smartphone className="w-5 h-5" />
              ) : (
                <Laptop className="w-5 h-5" />
              )}
            </span>
            <div className="min-w-0">
              <h3
                id="device-edit-modal-title"
                className="font-display text-xl uppercase tracking-tight text-(--text-primary) truncate"
              >
                {mode === "register"
                  ? "Register Trusted Device"
                  : "Edit Device Details"}
              </h3>
              <p className="text-[11px] font-mono text-(--text-muted) truncate">
                {model} · {platform} {osVersion} · {browser}
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            shape="pill"
            disabled={saving}
            onClick={onClose}
            aria-label="Close device dialog"
            className="shrink-0"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 min-h-0 lou-scrollarea">
          {/* Detected Cryptographic & Platform Telemetry Summary */}
          <div className="p-3.5 rounded-(--radius-control) bg-(--bg-surface-2) border border-(--border-subtle) space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-(--text-muted) flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-(--text-accent)" />
                Detected Hardware &amp; Key Proof
              </span>
              <span
                className={`text-[10px] font-mono uppercase tracking-[0.14em] ${
                  thumbprint ? "text-emerald-400" : "text-amber-400"
                }`}
              >
                {thumbprint ? "ECDSA P-256 Bound" : "HTTP Fallback"}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
              <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-control) px-2.5 py-1.5">
                <span className="text-(--text-muted) block text-[9px] uppercase">
                  Key Fingerprint
                </span>
                <span className="text-(--text-primary) truncate block">
                  {thumbprint || "Requires HTTPS secure context"}
                </span>
              </div>
              <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-control) px-2.5 py-1.5">
                <span className="text-(--text-muted) block text-[9px] uppercase">
                  Display, CPU &amp; Arch
                </span>
                <span className="text-(--text-primary) truncate block">
                  {screenMetrics || "Unknown"}
                  {cpuCores ? ` · ${cpuCores} cores` : ""}
                  {architecture ? ` · ${architecture}` : ""}
                </span>
              </div>
              {gpuRenderer && (
                <div className="sm:col-span-2 bg-(--bg-surface) border border-(--border-subtle) rounded-(--radius-control) px-2.5 py-1.5">
                  <span className="text-(--text-muted) block text-[9px] uppercase">
                    GPU Hardware Renderer
                  </span>
                  <span className="text-(--text-primary) truncate block">
                    {gpuRenderer}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <TextField
              id="device-friendly-name"
              label="Device Label"
              value={name}
              onChange={(val) => setName(sanitizeDeviceLabel(val, 60))}
              placeholder="e.g., Lou Main Workstation or Galaxy S24"
              minLength={2}
              maxLength={60}
              required
            />
          </div>
        </div>

        <div className="px-4 sm:px-6 py-3.5 bg-(--bg-surface-2) flex flex-wrap items-center justify-end gap-2.5 border-t border-(--border-subtle) shrink-0">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={saving}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={!canSubmit}
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>
              {mode === "register" ? "Trust This Device" : "Save Label"}
            </span>
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

