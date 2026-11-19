"use client";

import React, { useMemo, useState } from "react";
import { Crosshair, MousePointerClick } from "lucide-react";
import type { AppearanceConfig, CursorSizeMode } from "@/types/portfolio";
import type { SettingsFeedback } from "./types";
import { StatusPill } from "@/components/ui/StatusPill";
import { InfoTooltip } from "@/components/ui/Tooltip";
import { ImageUploadField } from "@/components/ui/fields";
import { TransformedImage } from "@/components/ui/TransformedImage";
import {
  CURSOR_FILE_ACCEPT,
  validateCursorFile,
} from "@/lib/inputValidation";
import { prepareCursorMasterUpload } from "@/lib/cursorUpload";
import { createDefaultImageTransform } from "@/lib/imageTransform";
import { clampCursorHotspot, resolveCursorCssVars } from "@/lib/appearance";
import { cn } from "@/lib/utils";

const CURSOR_SIZE_OPTIONS: ReadonlyArray<{
  id: CursorSizeMode;
  label: string;
}> = [
  { id: 32, label: "32px Classic" },
  { id: 48, label: "48px Balanced" },
  { id: 64, label: "64px Expressive" },
  { id: 96, label: "96px Display" },
];

const CHECKERBOARD_STYLE: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg, rgba(127,127,127,0.14) 25%, transparent 25%), linear-gradient(-45deg, rgba(127,127,127,0.14) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(127,127,127,0.14) 75%), linear-gradient(-45deg, transparent 75%, rgba(127,127,127,0.14) 75%)",
  backgroundSize: "12px 12px",
  backgroundPosition: "0 0, 0 6px, 6px -6px, -6px 0",
};

export interface CursorUploadSettingsProps {
  draft: AppearanceConfig;
  savedSnapshot?: AppearanceConfig;
  onUpdateDraft: (
    updater: (prev: AppearanceConfig) => AppearanceConfig
  ) => void;
  onFeedback: (feedback: SettingsFeedback | null) => void;
}

/**
 * Modular control panel reusing `<ImageUploadField />` (Zoom, Pan Position & Frame in placeholder)
 * alongside zero-reupload CSS `image-set` display sizing and visual click-to-set hotspot calibration.
 */
export function CursorUploadSettings({
  draft,
  savedSnapshot,
  onUpdateDraft,
  onFeedback,
}: CursorUploadSettingsProps) {
  const [hotspotTargetSlot, setHotspotTargetSlot] = useState<
    "default" | "pointer"
  >("default");
  const [measuredDims, setMeasuredDims] = useState<{
    default: { w: number; h: number } | null;
    pointer: { w: number; h: number } | null;
  }>({ default: null, pointer: null });
  const [padClicks, setPadClicks] = useState(0);

  const cursorEnabled = Boolean(draft.customCursorEnabled);
  const cursorSize: CursorSizeMode = draft.customCursorSize ?? 48;
  const hotspotX = draft.customCursorHotspotX ?? 4;
  const hotspotY = draft.customCursorHotspotY ?? 4;
  const defaultUrl = draft.customCursorDefaultUrl || "";
  const pointerUrl = draft.customCursorPointerUrl || "";

  const defaultSourceSize =
    draft.customCursorDefaultSourceSize ?? measuredDims.default?.w;
  const pointerSourceSize =
    draft.customCursorPointerSourceSize ?? measuredDims.pointer?.w;

  const previewCursorVars = useMemo(
    () =>
      resolveCursorCssVars({
        ...draft,
        customCursorEnabled: Boolean(defaultUrl.trim() || pointerUrl.trim()),
        customCursorDefaultSourceSize: defaultSourceSize,
        customCursorPointerSourceSize: pointerSourceSize,
      }),
    [draft, defaultUrl, pointerUrl, defaultSourceSize, pointerSourceSize]
  );

  const handleSelectCursorSize = (nextSize: CursorSizeMode) => {
    const prevSize = cursorSize;
    if (nextSize === prevSize) return;

    const scaledHotspotX = clampCursorHotspot(
      Math.round((hotspotX / Math.max(1, prevSize)) * nextSize),
      4
    );
    const scaledHotspotY = clampCursorHotspot(
      Math.round((hotspotY / Math.max(1, prevSize)) * nextSize),
      4
    );

    onUpdateDraft((prev) => ({
      ...prev,
      customCursorSize: nextSize,
      customCursorHotspotX: scaledHotspotX,
      customCursorHotspotY: scaledHotspotY,
    }));
  };

  const hasAnyCursor = Boolean(defaultUrl.trim() || pointerUrl.trim());
  const activePreviewSlot: "default" | "pointer" =
    hotspotTargetSlot === "pointer" && pointerUrl.trim()
      ? "pointer"
      : defaultUrl.trim()
        ? "default"
        : pointerUrl.trim()
          ? "pointer"
          : "default";

  const activePreviewUrl =
    activePreviewSlot === "pointer" ? pointerUrl.trim() : defaultUrl.trim();
  const activeTransform =
    activePreviewSlot === "pointer"
      ? draft.customCursorPointerTransform
      : draft.customCursorDefaultTransform;
  const activeIsNativeBinary = /\.(cur|ico)(?:$|\?)/i.test(activePreviewUrl);
  const activeHotspotRange = activeIsNativeBinary
    ? Math.max(
        32,
        Math.min(128, measuredDims[activePreviewSlot]?.w || cursorSize)
      )
    : cursorSize;

  const updateHotspotFromPointerEvent = (
    e: React.PointerEvent<HTMLDivElement>
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const relY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const pxX = clampCursorHotspot(
      Math.round(relX * Math.max(1, activeHotspotRange - 1)),
      4
    );
    const pxY = clampCursorHotspot(
      Math.round(relY * Math.max(1, activeHotspotRange - 1)),
      4
    );
    onUpdateDraft((prev) => ({
      ...prev,
      customCursorHotspotX: pxX,
      customCursorHotspotY: pxY,
    }));
  };

  const markerLeftPct = Math.max(
    0,
    Math.min(100, (hotspotX / Math.max(1, activeHotspotRange)) * 100)
  );
  const markerTopPct = Math.max(
    0,
    Math.min(100, (hotspotY / Math.max(1, activeHotspotRange)) * 100)
  );

  return (
    <div className="pt-4 border-t border-(--border-subtle) space-y-4">
      {/* Header + Master ON/OFF Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.18em] text-(--text-muted)">
              <span>Uploaded Cursor Pack (Native CSS)</span>
              <InfoTooltip
                label="Zero-JS hardware pointer & recruiter toggle"
                content="Uses native CSS cursor & image-set scaling from your single sharp upload on desktop fine pointers with 0% CPU cost. Toggle OFF anytime for recruiters without deleting your uploaded files."
              />
            </span>
            <StatusPill
              label={
                cursorEnabled && hasAnyCursor
                  ? "Live on Public Site"
                  : cursorEnabled && !hasAnyCursor
                    ? "Enabled · Upload Asset"
                    : "Paused · OS Pointer"
              }
              variant={
                cursorEnabled && hasAnyCursor
                  ? "success"
                  : cursorEnabled
                    ? "warning"
                    : "neutral"
              }
              size="xs"
            />
          </div>
          <p className="text-[11px] text-(--text-muted) leading-snug">
            Upload `.png` or `.cur` packs once. Hover a placeholder to zoom,
            reposition, or frame it cleanly without re-uploading.
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={cursorEnabled}
          aria-label="Enable uploaded custom cursor on public portfolio"
          onClick={() =>
            onUpdateDraft((prev) => ({
              ...prev,
              customCursorEnabled: !prev.customCursorEnabled,
            }))
          }
          className="inline-flex items-center gap-2.5 px-3 py-2 rounded-(--radius-control) bg-(--bg-surface-2) border border-(--border-subtle) hover:border-(--border-strong) transition-colors cursor-pointer shrink-0 self-start sm:self-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <span className="text-xs font-mono uppercase tracking-wider text-(--text-primary)">
            {cursorEnabled ? "Cursor On" : "Cursor Off"}
          </span>
          <span
            aria-hidden="true"
            className={cn(
              "w-10 h-5.5 rounded-full border p-0.5 transition-colors inline-flex items-center",
              cursorEnabled
                ? "bg-brand border-brand justify-end"
                : "bg-(--bg-surface) border-(--border-strong) justify-start"
            )}
          >
            <span
              className={cn(
                "w-4 h-4 rounded-full transition-transform",
                cursorEnabled ? "bg-brand-contrast" : "bg-(--text-muted)"
              )}
            />
          </span>
        </button>
      </div>

      {/* Cursor Asset Cards (reusing ImageUploadField + ImageCropModal just like Profile Portrait) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 sm:gap-4">
        <div className="p-3.5 sm:p-4 rounded-(--radius-control) bg-(--bg-surface-2) border border-(--border-subtle) min-w-0">
          <ImageUploadField
            label="Default Cursor Image Path or URL"
            value={defaultUrl}
            transform={draft.customCursorDefaultTransform}
            onChange={(customCursorDefaultUrl) =>
              onUpdateDraft((prev) => ({
                ...prev,
                customCursorDefaultUrl,
                ...(customCursorDefaultUrl
                  ? {}
                  : {
                      customCursorDefaultSourceSize: undefined,
                      customCursorEnabled: Boolean(prev.customCursorPointerUrl),
                    }),
              }))
            }
            onTransformChange={(customCursorDefaultTransform) =>
              onUpdateDraft((prev) => ({
                ...prev,
                customCursorDefaultTransform,
              }))
            }
            onRevertToSaved={() => {
              onUpdateDraft((prev) => ({
                ...prev,
                customCursorDefaultUrl:
                  savedSnapshot?.customCursorDefaultUrl ?? "",
                customCursorDefaultTransform:
                  savedSnapshot?.customCursorDefaultTransform ??
                  createDefaultImageTransform("squircle"),
                customCursorDefaultSourceSize:
                  savedSnapshot?.customCursorDefaultSourceSize,
              }));
            }}
            folder="cursors"
            accept={CURSOR_FILE_ACCEPT}
            validateFile={validateCursorFile}
            prepareFileForUpload={prepareCursorMasterUpload}
            onUploadMeta={({ sourceWidth, detectedHotspot }) => {
              onUpdateDraft((prev) => ({
                ...prev,
                ...(sourceWidth ? { customCursorDefaultSourceSize: sourceWidth } : {}),
                ...(detectedHotspot
                  ? {
                      customCursorHotspotX: detectedHotspot.x,
                      customCursorHotspotY: detectedHotspot.y,
                    }
                  : {}),
                customCursorEnabled: true,
              }));
            }}
            onNaturalSize={({ width, height }) =>
              setMeasuredDims((prev) =>
                prev.default?.w === width && prev.default?.h === height
                  ? prev
                  : { ...prev, default: { w: width, h: height } }
              )
            }
            onUploadError={(message) =>
              onFeedback({ type: "error", message })
            }
            removeDescription="This clears your uploaded Default Cursor path from the draft until you click Save & Publish."
            placeholder="/uploads/cursors/default.png"
            previewShape="squircle"
            previewSize="md"
            previewFit="contain"
            previewAlt="Default cursor placeholder preview"
            isDraftModified={
              savedSnapshot
                ? defaultUrl !== (savedSnapshot.customCursorDefaultUrl || "") ||
                  JSON.stringify(draft.customCursorDefaultTransform) !==
                    JSON.stringify(savedSnapshot.customCursorDefaultTransform)
                : false
            }
            hint="Accepts .png, .cur, .webp, .ico (max 512KB). Click Resize / Edit on the placeholder to zoom & position."
          />
        </div>

        <div className="p-3.5 sm:p-4 rounded-(--radius-control) bg-(--bg-surface-2) border border-(--border-subtle) min-w-0">
          <ImageUploadField
            label="Hover / Link Pointer Image Path or URL"
            value={pointerUrl}
            transform={draft.customCursorPointerTransform}
            onChange={(customCursorPointerUrl) =>
              onUpdateDraft((prev) => ({
                ...prev,
                customCursorPointerUrl,
                ...(customCursorPointerUrl
                  ? {}
                  : {
                      customCursorPointerSourceSize: undefined,
                      customCursorEnabled: Boolean(prev.customCursorDefaultUrl),
                    }),
              }))
            }
            onTransformChange={(customCursorPointerTransform) =>
              onUpdateDraft((prev) => ({
                ...prev,
                customCursorPointerTransform,
              }))
            }
            onRevertToSaved={() => {
              onUpdateDraft((prev) => ({
                ...prev,
                customCursorPointerUrl:
                  savedSnapshot?.customCursorPointerUrl ?? "",
                customCursorPointerTransform:
                  savedSnapshot?.customCursorPointerTransform ??
                  createDefaultImageTransform("squircle"),
                customCursorPointerSourceSize:
                  savedSnapshot?.customCursorPointerSourceSize,
              }));
            }}
            folder="cursors"
            accept={CURSOR_FILE_ACCEPT}
            validateFile={validateCursorFile}
            prepareFileForUpload={prepareCursorMasterUpload}
            onUploadMeta={({ sourceWidth }) => {
              onUpdateDraft((prev) => ({
                ...prev,
                ...(sourceWidth ? { customCursorPointerSourceSize: sourceWidth } : {}),
                customCursorEnabled: true,
              }));
            }}
            onNaturalSize={({ width, height }) =>
              setMeasuredDims((prev) =>
                prev.pointer?.w === width && prev.pointer?.h === height
                  ? prev
                  : { ...prev, pointer: { w: width, h: height } }
              )
            }
            onUploadError={(message) =>
              onFeedback({ type: "error", message })
            }
            removeDescription="This clears your Hover / Link Pointer asset path from the draft; links will fall back to your Default Cursor."
            placeholder="/uploads/cursors/pointer.png"
            previewShape="squircle"
            previewSize="md"
            previewFit="contain"
            previewAlt="Hover link pointer placeholder preview"
            isDraftModified={
              savedSnapshot
                ? pointerUrl !== (savedSnapshot.customCursorPointerUrl || "") ||
                  JSON.stringify(draft.customCursorPointerTransform) !==
                    JSON.stringify(savedSnapshot.customCursorPointerTransform)
                : false
            }
            hint="Optional pointer state for links & buttons (falls back to Default). Hover placeholder to zoom & position."
          />
        </div>
      </div>

      {/* Live CSS Size Scaling + Visual Hotspot Calibration + Test Pad */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        {/* 1. Zero-Upload CSS Cursor Display Size */}
        <div className="p-3 rounded-(--radius-control) bg-(--bg-surface-2) border border-(--border-subtle) flex flex-col justify-between gap-2.5">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-mono uppercase tracking-[0.16em] text-(--text-muted)">
                Cursor Display Size
              </span>
              {defaultSourceSize && (
                <span className="text-[10px] font-mono text-(--text-muted)">
                  Source: {defaultSourceSize}px
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {CURSOR_SIZE_OPTIONS.map((opt) => {
                const active = cursorSize === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => handleSelectCursorSize(opt.id)}
                    className={cn(
                      "px-2.5 py-1.5 rounded-(--radius-control) border text-[11px] font-mono transition-colors cursor-pointer text-left truncate",
                      active
                        ? "bg-(--bg-badge-highlight) border-brand text-(--text-accent)"
                        : "bg-(--bg-surface) border-(--border-subtle) text-(--text-secondary) hover:border-(--border-strong)"
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <p className="text-[10px] text-(--text-muted) leading-snug">
            Resizes crisply via native CSS `image-set` from your single uploaded
            asset — no re-upload or blur.
          </p>
        </div>

        {/* 2. Interactive Visual Click-to-Set Hotspot Picker */}
        <div className="p-3 rounded-(--radius-control) bg-(--bg-surface-2) border border-(--border-subtle) space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.16em] text-(--text-muted)">
              <Crosshair className="w-3 h-3 text-(--text-accent)" />
              <span>Click Hotspot (px)</span>
            </span>

            {defaultUrl.trim() && pointerUrl.trim() && (
              <div className="inline-flex rounded border border-(--border-subtle) overflow-hidden">
                <button
                  type="button"
                  onClick={() => setHotspotTargetSlot("default")}
                  className={cn(
                    "px-1.5 py-0.5 text-[10px] font-mono cursor-pointer transition-colors",
                    activePreviewSlot === "default"
                      ? "bg-brand text-brand-contrast"
                      : "bg-(--bg-surface) text-(--text-muted)"
                  )}
                >
                  Def
                </button>
                <button
                  type="button"
                  onClick={() => setHotspotTargetSlot("pointer")}
                  className={cn(
                    "px-1.5 py-0.5 text-[10px] font-mono cursor-pointer transition-colors",
                    activePreviewSlot === "pointer"
                      ? "bg-brand text-brand-contrast"
                      : "bg-(--bg-surface) text-(--text-muted)"
                  )}
                >
                  Ptr
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Interactive Click / Drag Target Frame */}
            <div
              role="slider"
              aria-label="Click on cursor preview to position click hotspot"
              aria-valuemin={0}
              aria-valuemax={activeHotspotRange}
              aria-valuenow={hotspotX}
              tabIndex={0}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                updateHotspotFromPointerEvent(e);
              }}
              onPointerMove={(e) => {
                if (e.buttons === 1) {
                  updateHotspotFromPointerEvent(e);
                }
              }}
              style={CHECKERBOARD_STYLE}
              className="relative w-22 h-22 shrink-0 rounded-(--radius-control) border border-(--border-strong) bg-(--bg-surface) overflow-hidden cursor-crosshair select-none touch-none"
            >
              {activePreviewUrl ? (
                <div className="w-full h-full pointer-events-none">
                  <TransformedImage
                    src={activePreviewUrl}
                    alt="Cursor hotspot calibration target"
                    transform={activeTransform}
                    defaultFit="contain"
                    defaultPosition="center"
                    className="w-full h-full"
                  />
                </div>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[10px] font-mono text-(--text-muted) text-center px-1">
                  No Image
                </div>
              )}

              {/* Crosshair Lines & Dot */}
              <div
                aria-hidden="true"
                style={{ left: `${markerLeftPct}%` }}
                className="absolute inset-y-0 w-px bg-brand/55 pointer-events-none"
              />
              <div
                aria-hidden="true"
                style={{ top: `${markerTopPct}%` }}
                className="absolute inset-x-0 h-px bg-brand/55 pointer-events-none"
              />
              <div
                aria-hidden="true"
                style={{ left: `${markerLeftPct}%`, top: `${markerTopPct}%` }}
                className="absolute -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-brand ring-2 ring-white shadow-sm pointer-events-none"
              />
            </div>

            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-[10px] text-(--text-muted) leading-snug">
                Click/drag on preview to aim where clicks trigger (`0–
                {activeHotspotRange}px`).
              </p>

              <div className="grid grid-cols-2 gap-1.5">
                <label className="space-y-0.5">
                  <span className="text-[10px] font-mono uppercase text-(--text-muted) block">
                    X
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={128}
                    value={hotspotX}
                    onChange={(e) =>
                      onUpdateDraft((prev) => ({
                        ...prev,
                        customCursorHotspotX: clampCursorHotspot(
                          e.target.value,
                          4
                        ),
                      }))
                    }
                    className="w-full px-2 py-1 rounded-(--radius-control) bg-(--bg-surface) border border-(--border-subtle) text-xs font-mono text-(--text-primary) focus:outline-none focus:border-brand"
                  />
                </label>
                <label className="space-y-0.5">
                  <span className="text-[10px] font-mono uppercase text-(--text-muted) block">
                    Y
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={128}
                    value={hotspotY}
                    onChange={(e) =>
                      onUpdateDraft((prev) => ({
                        ...prev,
                        customCursorHotspotY: clampCursorHotspot(
                          e.target.value,
                          4
                        ),
                      }))
                    }
                    className="w-full px-2 py-1 rounded-(--radius-control) bg-(--bg-surface) border border-(--border-subtle) text-xs font-mono text-(--text-primary) focus:outline-none focus:border-brand"
                  />
                </label>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateDraft((prev) => ({
                      ...prev,
                      customCursorHotspotX: 4,
                      customCursorHotspotY: 4,
                    }))
                  }
                  className="px-2 py-0.5 text-[10px] font-mono rounded border border-(--border-subtle) bg-(--bg-surface) text-(--text-secondary) hover:text-(--text-primary) cursor-pointer"
                >
                  Tip (4,4)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateDraft((prev) => ({
                      ...prev,
                      customCursorHotspotX: clampCursorHotspot(
                        Math.round(activeHotspotRange / 2),
                        24
                      ),
                      customCursorHotspotY: clampCursorHotspot(
                        Math.round(activeHotspotRange / 2),
                        24
                      ),
                    }))
                  }
                  className="px-2 py-0.5 text-[10px] font-mono rounded border border-(--border-subtle) bg-(--bg-surface) text-(--text-secondary) hover:text-(--text-primary) cursor-pointer"
                >
                  Center
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Live Hover & Click Calibration Pad */}
        <div
          style={{
            cursor: hasAnyCursor ? previewCursorVars.defaultCss : "auto",
          }}
          className="p-3 rounded-(--radius-control) bg-(--bg-surface-2) border border-dashed border-(--border-strong) flex flex-col justify-between gap-2.5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-mono uppercase tracking-[0.16em] text-(--text-accent)">
              Live Hover Test Pad
            </span>
            <MousePointerClick
              className="w-3.5 h-3.5 text-(--text-muted)"
              aria-hidden="true"
            />
          </div>
          <p className="text-[11px] text-(--text-muted) leading-snug">
            {hasAnyCursor
              ? "Move across this pad for Default Cursor, and click below to verify crisp size & hotspot accuracy."
              : "Upload or paste a cursor asset above to test size & hotspot accuracy here."}
          </p>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setPadClicks((c) => c + 1)}
              style={{
                cursor: hasAnyCursor ? previewCursorVars.pointerCss : "pointer",
              }}
              className="px-3 py-1.5 rounded-(--radius-control) bg-brand text-brand-contrast text-[11px] font-mono uppercase tracking-wider transition-opacity hover:opacity-90"
            >
              Test Click ({padClicks})
            </button>
            <span className="text-[10px] font-mono text-(--text-muted)">
              {cursorSize}px · ({hotspotX},{hotspotY})
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
