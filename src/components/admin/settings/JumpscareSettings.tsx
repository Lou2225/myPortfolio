"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  Check,
  Copy,
  Ghost,
  Loader2,
  Play,
  Square,
  Trash2,
  Upload,
  Volume2,
} from "lucide-react";
import type {
  AppearanceConfig,
  JumpscareTriggerMode,
} from "@/types/portfolio";
import type { SettingsFeedback } from "./types";
import {
  isNetworkOffline,
  useOfflineStatus,
} from "@/components/pwa/OfflineManager";
import { InfoTooltip } from "@/components/ui/Tooltip";
import { Button } from "@/components/ui/Button";
import {
  ImageUploadField,
  SubjectField,
  UrlField,
} from "@/components/ui/fields";
import { FIELD_SLOT_BUTTON_CLASS } from "@/components/ui/fields/inputStyles";
import { IconActionButton } from "@/components/ui/ActionButtons";
import { AUDIO_FILE_ACCEPT, validateAudioFile } from "@/lib/inputValidation";
import { createDefaultImageTransform } from "@/lib/imageTransform";
import { dispatchJumpscareTrigger } from "@/lib/jumpscare";
import {
  playJumpscareAudio,
  preloadJumpscareAudio,
  registerInstantAudio,
  resolveJumpscareVolume,
} from "@/lib/jumpscareAudio";
import { cn } from "@/lib/utils";

const TRIGGER_MODES: ReadonlyArray<{
  id: JumpscareTriggerMode;
  label: string;
  caption: string;
}> = [
  {
    id: "secret-taps",
    label: "Secret 5x Tap + Bait",
    caption: "Tap Portrait 5x, type 'boo', or click footer pill (recruiter-safe).",
  },
  {
    id: "get-in-touch",
    label: "Get In Touch + Contact Me",
    caption: "Triggers on 'Get In Touch' or 'Contact Me' & pauses scroll while Scare is On.",
  },
  {
    id: "prank-link",
    label: "?prank=1 Stealth Link",
    caption: "Silent on main URL; springs on first click when shared via /?prank=1.",
  },
  {
    id: "first-click",
    label: "Armed First Click",
    caption: "Fires once per page load on a visitor's very first click anywhere.",
  },
];

function inferAudioMime(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".ogg")) return "audio/ogg";
  return "audio/mpeg";
}

export interface JumpscareSettingsProps {
  draft: AppearanceConfig;
  savedSnapshot?: AppearanceConfig;
  onUpdateDraft: (
    updater: (prev: AppearanceConfig) => AppearanceConfig
  ) => void;
  onFeedback: (feedback: SettingsFeedback | null) => void;
}

/**
 * Modular CMS card for configuring the optional Jumpscare Easter Egg
 * (ON/OFF gate, trigger strategy, full-screen scare image with framing editor,
 * instant RAM-cached `.mp3`/`.wav`/`.ogg` audio or built-in synth sting, and Test button).
 */
export function JumpscareSettings({
  draft,
  savedSnapshot,
  onUpdateDraft,
  onFeedback,
}: JumpscareSettingsProps) {
  const { isOnline } = useOfflineStatus();
  const audioFieldId = useId();
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [playingSample, setPlayingSample] = useState(false);
  const [copiedPrankLink, setCopiedPrankLink] = useState(false);
  const stopSampleRef = useRef<(() => void) | null>(null);
  const sampleTimerRef = useRef<number | null>(null);

  const stopSample = useCallback(() => {
    if (sampleTimerRef.current !== null) {
      window.clearTimeout(sampleTimerRef.current);
      sampleTimerRef.current = null;
    }
    stopSampleRef.current?.();
    stopSampleRef.current = null;
    setPlayingSample(false);
  }, []);

  useEffect(() => stopSample, [stopSample]);

  const enabled = Boolean(draft.jumpscareEnabled);
  const triggerMode: JumpscareTriggerMode =
    draft.jumpscareTrigger || "secret-taps";
  const imageUrl = draft.jumpscareImageUrl || "";
  const audioUrl = draft.jumpscareAudioUrl || "";
  const volume = resolveJumpscareVolume(draft.jumpscareVolume);
  const caption = draft.jumpscareCaption ?? "GOTCHA.";

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFile = e.target.files?.[0];
    e.target.value = "";
    if (!rawFile) return;

    if (isNetworkOffline(isOnline)) {
      const msg = "Offline — Reconnect to upload audio clips.";
      setAudioError(msg);
      onFeedback({ type: "error", message: msg });
      return;
    }

    const check = validateAudioFile(rawFile);
    if (!check.valid) {
      const msg = check.error || "Invalid audio file format.";
      setAudioError(msg);
      onFeedback({ type: "error", message: msg });
      return;
    }

    const uploadFile = rawFile.type
      ? rawFile
      : new File([rawFile], rawFile.name, {
          type: inferAudioMime(rawFile.name),
        });

    setAudioError(null);
    onFeedback(null);
    setUploadingAudio(true);

    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("folder", "audio");

      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) {
        throw new Error(data?.error || "Failed to upload scare audio.");
      }

      const uploadedUrl = String(data.url);
      // Cache decoded buffer + Blob immediately in RAM so Preview & public clicks fire in < 5ms
      registerInstantAudio(uploadedUrl, uploadFile);

      onUpdateDraft((prev) => ({
        ...prev,
        jumpscareAudioUrl: uploadedUrl,
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Audio upload failed.";
      setAudioError(msg);
      onFeedback({ type: "error", message: msg });
    } finally {
      setUploadingAudio(false);
    }
  };

  const handleToggleAudioSample = () => {
    if (playingSample) {
      stopSample();
      return;
    }

    stopSample();
    setPlayingSample(true);
    stopSampleRef.current = playJumpscareAudio(audioUrl, volume);
    sampleTimerRef.current = window.setTimeout(() => {
      stopSample();
    }, 1750);
  };

  const handleCopyPrankUrl = async () => {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/?prank=1`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedPrankLink(true);
      window.setTimeout(() => setCopiedPrankLink(false), 2200);
    } catch {
      onFeedback({
        type: "error",
        message: `Could not access clipboard. Share ${url} manually.`,
      });
    }
  };

  return (
    <div className="pt-4 border-t border-(--border-subtle) space-y-4">
      {/* Header + Master ON/OFF Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5 min-w-0">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.18em] text-(--text-muted)">
            <Ghost className="w-3.5 h-3.5 text-(--text-accent)" />
            <span>Jumpscare Easter Egg (Prank Mode)</span>
            <InfoTooltip
              label="Full-screen once-per-session Easter egg"
              content="Slams edge-to-edge full screen with pre-decoded <5ms sound when triggered. Toggle OFF cleanly before sharing your portfolio with recruiters."
            />
          </span>
          <p className="text-[11px] text-(--text-muted) leading-snug">
            Slams edge-to-edge full screen with instant sound. Keep paused for
            hiring managers or flip ON and publish for friends.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => dispatchJumpscareTrigger("preview", true)}
            className="h-9.5 w-full sm:w-auto text-xs font-mono"
          >
            <Play className="w-3.5 h-3.5 text-(--text-accent)" />
            <span>Test Jumpscare</span>
          </Button>

          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Enable jumpscare Easter egg on public portfolio"
            onClick={() =>
              onUpdateDraft((prev) => ({
                ...prev,
                jumpscareEnabled: !prev.jumpscareEnabled,
              }))
            }
            className="inline-flex items-center justify-between sm:justify-start gap-2.5 px-3 py-2 rounded-(--radius-control) bg-(--bg-surface-2) border border-(--border-subtle) hover:border-(--border-strong) transition-colors cursor-pointer w-full sm:w-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <span className="text-xs font-mono uppercase tracking-wider text-(--text-primary)">
              {enabled ? "Scare On" : "Scare Off"}
            </span>
            <span
              aria-hidden="true"
              className={cn(
                "w-10 h-5.5 rounded-full border p-0.5 transition-colors inline-flex items-center",
                enabled
                  ? "bg-brand border-brand justify-end"
                  : "bg-(--bg-surface) border-(--border-strong) justify-start"
              )}
            >
              <span
                className={cn(
                  "w-4 h-4 rounded-full transition-transform",
                  enabled ? "bg-brand-contrast" : "bg-(--text-muted)"
                )}
              />
            </span>
          </button>
        </div>
      </div>

      {/* Trigger Strategy Picker */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-(--text-muted)">
            Trigger Behavior
          </span>
          {triggerMode === "prank-link" && (
            <button
              type="button"
              onClick={() => void handleCopyPrankUrl()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-(--radius-control) bg-(--bg-surface-2) border border-(--border-subtle) hover:border-brand/50 text-[10px] font-mono text-(--text-accent) cursor-pointer transition-colors"
            >
              {copiedPrankLink ? (
                <Check className="w-3 h-3" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
              <span>{copiedPrankLink ? "Copied /?prank=1" : "Copy /?prank=1 Link"}</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
          {TRIGGER_MODES.map((mode) => {
            const active = triggerMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  onUpdateDraft((prev) => ({
                    ...prev,
                    jumpscareTrigger: mode.id,
                  }))
                }
                className={cn(
                  "text-left rounded-(--radius-control) border px-3 py-2.5 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                  active
                    ? "bg-(--bg-badge-highlight) border-brand text-(--text-primary)"
                    : "bg-(--bg-surface-2) border-(--border-subtle) text-(--text-secondary) hover:border-(--border-strong)"
                )}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span
                    className={cn(
                      "text-[11px] font-mono font-semibold uppercase tracking-wider truncate",
                      active ? "text-(--text-accent)" : "text-(--text-primary)"
                    )}
                  >
                    {mode.label}
                  </span>
                  {active && (
                    <Check className="w-3.5 h-3.5 text-(--text-accent) shrink-0" />
                  )}
                </div>
                <p className="text-[11px] text-(--text-muted) mt-1 leading-snug">
                  {mode.caption}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Optional Media Upload Cards (Full-Screen Scare Image + Instant Audio + Caption/Volume) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 sm:gap-4">
        <div className="p-3.5 sm:p-4 rounded-(--radius-control) bg-(--bg-surface-2) border border-(--border-subtle) min-w-0">
          <ImageUploadField
            label="Scare Visual Path or URL (Optional)"
            value={imageUrl}
            transform={draft.jumpscareImageTransform}
            onChange={(jumpscareImageUrl) =>
              onUpdateDraft((prev) => ({ ...prev, jumpscareImageUrl }))
            }
            onTransformChange={(jumpscareImageTransform) =>
              onUpdateDraft((prev) => ({ ...prev, jumpscareImageTransform }))
            }
            onRevertToSaved={() => {
              onUpdateDraft((prev) => ({
                ...prev,
                jumpscareImageUrl: savedSnapshot?.jumpscareImageUrl ?? "",
                jumpscareImageTransform:
                  savedSnapshot?.jumpscareImageTransform ??
                  createDefaultImageTransform("squircle"),
              }));
            }}
            folder="scares"
            onUploadError={(message) =>
              onFeedback({ type: "error", message })
            }
            removeDescription="This clears your custom jumpscare image and falls back to the built-in horror graphic."
            placeholder="/uploads/scares/gotcha.png (or leave empty)"
            previewShape="squircle"
            previewSize="md"
            previewFit="contain"
            previewAlt="Jumpscare full-screen graphic preview"
            isDraftModified={
              savedSnapshot
                ? imageUrl !== (savedSnapshot.jumpscareImageUrl || "") ||
                  JSON.stringify(draft.jumpscareImageTransform) !==
                    JSON.stringify(savedSnapshot.jumpscareImageTransform)
                : false
            }
            hint="Pops up full-screen on trigger. Upload .png/.webp/.jpg (max 5MB) or leave empty for built-in glitch."
          />
        </div>

        <div className="p-3.5 sm:p-4 rounded-(--radius-control) bg-(--bg-surface-2) border border-(--border-subtle) space-y-3 min-w-0">
          <UrlField
            id={audioFieldId}
            label="Scare Audio Clip Path or URL (Optional)"
            value={audioUrl}
            onChange={(jumpscareAudioUrl) => {
              setAudioError(null);
              if (jumpscareAudioUrl.trim()) {
                preloadJumpscareAudio(jumpscareAudioUrl);
              }
              onUpdateDraft((prev) => ({ ...prev, jumpscareAudioUrl }));
            }}
            placeholder="/uploads/audio/sting.mp3 (empty = Web Audio synth)"
            allowRelativePath
            maxLength={500}
            hint="Pre-decoded in RAM for instant <5ms playback. Leave empty for Web Audio synth, or upload .mp3/.wav/.ogg (max 2.5MB)."
            rightSlot={
              <div className="flex items-center gap-1.5 w-full sm:w-auto shrink-0">
                <label
                  className={cn(
                    FIELD_SLOT_BUTTON_CLASS,
                    "flex-1 sm:flex-initial justify-center",
                    uploadingAudio && "opacity-60 pointer-events-none"
                  )}
                >
                  {uploadingAudio ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-(--text-accent)" />
                  ) : (
                    <Upload className="w-3.5 h-3.5 text-(--text-accent)" />
                  )}
                  <span>{uploadingAudio ? "Uploading..." : "Upload Audio"}</span>
                  <input
                    type="file"
                    accept={AUDIO_FILE_ACCEPT}
                    disabled={uploadingAudio}
                    onChange={handleAudioUpload}
                    className="hidden"
                  />
                </label>

                <IconActionButton
                  label={playingSample ? "Stop audio preview" : "Play audio preview"}
                  size="field"
                  onClick={handleToggleAudioSample}
                  icon={
                    playingSample ? (
                      <Square className="w-3.5 h-3.5 text-(--text-accent)" />
                    ) : (
                      <Volume2 className="w-4 h-4 text-(--text-accent)" />
                    )
                  }
                />

                {audioUrl.trim() && (
                  <IconActionButton
                    label="Remove scare audio clip"
                    intent="danger"
                    size="field"
                    onClick={() => {
                      stopSample();
                      setAudioError(null);
                      onUpdateDraft((prev) => ({
                        ...prev,
                        jumpscareAudioUrl: "",
                      }));
                    }}
                    icon={<Trash2 className="w-3.5 h-3.5" aria-hidden="true" />}
                  />
                )}
              </div>
            }
          />

          {audioError && (
            <p role="alert" className="text-[11px] font-mono text-(--text-accent)">
              {audioError}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <SubjectField
              label="Scare Caption"
              value={caption}
              required={false}
              minLength={0}
              maxLength={80}
              showCounter={false}
              placeholder="GOTCHA."
              onChange={(jumpscareCaption) =>
                onUpdateDraft((prev) => ({ ...prev, jumpscareCaption }))
              }
            />

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-(--text-muted)">
                <span>Audio Volume</span>
                <span className="text-(--text-primary)">
                  {Math.round(volume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={Math.round(volume * 100)}
                onChange={(e) =>
                  onUpdateDraft((prev) => ({
                    ...prev,
                    jumpscareVolume: Number(e.target.value) / 100,
                  }))
                }
                aria-label="Jumpscare audio volume percentage"
                className="w-full accent-(--accent) cursor-pointer h-10.5"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
