"use client";

import React, { useEffect, useState } from "react";
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
import { StatusPill } from "@/components/ui/StatusPill";
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

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      if (targetDevice) {
        setName(targetDevice.name);
      } else if (liveTelemetry) {
        setName(liveTelemetry.suggestedName);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [open, targetDevice, liveTelemetry]);

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
      <form onSubmit={handleSave} className="p-5 sm:p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-(--radius-control) bg-(--bg-badge-highlight) border border-brand/40 flex items-center justify-center shrink-0 text-(--text-accent)">
              {deviceType === "mobile" || deviceType === "tablet" ? (
                <Smartphone className="w-5 h-5" />
              ) : (
                <Laptop className="w-5 h-5" />
              )}
            </span>
            <div>
              <h3
                id="device-edit-modal-title"
                className="font-display text-xl uppercase tracking-tight text-(--text-primary)"
              >
                {mode === "register"
                  ? "Register Trusted Device"
                  : "Edit Device Details"}
              </h3>
              <p className="text-[11px] font-mono text-(--text-muted)">
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
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Detected Cryptographic & Platform Telemetry Summary */}
        <div className="p-3.5 rounded-sm bg-(--bg-surface-2) border border-(--border-subtle) space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-(--text-muted) flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-(--text-accent)" />
              Detected Hardware & Key Proof
            </span>
            <StatusPill
              label={thumbprint ? "ECDSA P-256 Bound" : "HTTP Fallback"}
              variant={thumbprint ? "success" : "warning"}
              size="xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
            <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-sm px-2.5 py-1.5">
              <span className="text-(--text-muted) block text-[9px] uppercase">
                Key Fingerprint
              </span>
              <span className="text-(--text-primary) truncate block">
                {thumbprint || "Available on HTTPS / localhost"}
              </span>
            </div>
            <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-sm px-2.5 py-1.5">
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
              <div className="col-span-2 bg-(--bg-surface) border border-(--border-subtle) rounded-sm px-2.5 py-1.5">
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

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-(--border-subtle)">
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

