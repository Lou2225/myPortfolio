"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { Pipette, ChevronDown, Check, Sparkles } from "lucide-react";
import { DropdownPopover } from "@/components/ui/DropdownPopover";
import { FieldWrapper } from "@/components/ui/fields/FieldWrapper";
import { cn } from "@/lib/utils";

export interface ColorPickerDropdownProps {
  id: string;
  label?: string;
  value: string;
  onChange: (nextHex: string) => void;
  presets?: readonly { id: string; label: string; hex: string }[];
  disabled?: boolean;
  hint?: string;
  className?: string;
}

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

interface HsvColor {
  h: number; // 0-360
  s: number; // 0-100
  v: number; // 0-100
}

function clamp(num: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, num));
}

function normalizeHex(raw: string): string | null {
  const cleaned = raw.trim().replace(/^#/, "").toUpperCase();
  if (/^[0-9A-F]{6}$/.test(cleaned)) {
    return `#${cleaned}`;
  }
  if (/^[0-9A-F]{3}$/.test(cleaned)) {
    const expanded = cleaned
      .split("")
      .map((c) => c + c)
      .join("");
    return `#${expanded}`;
  }
  return null;
}

function hexToRgb(hex: string): RgbColor {
  const safe = normalizeHex(hex) || "#FF3B1D";
  return {
    r: parseInt(safe.slice(1, 3), 16),
    g: parseInt(safe.slice(3, 5), 16),
    b: parseInt(safe.slice(5, 7), 16),
  };
}

function rgbToHex({ r, g, b }: RgbColor): string {
  const toHex = (v: number) =>
    clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0").toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbToHsv({ r, g, b }: RgbColor): HsvColor {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rn) {
      h = ((gn - bn) / delta) % 6;
    } else if (max === gn) {
      h = (bn - rn) / delta + 2;
    } else {
      h = (rn - gn) / delta + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : (delta / max) * 100;
  const v = max * 100;
  return {
    h: Math.round(h),
    s: Math.round(s),
    v: Math.round(v),
  };
}

function hsvToRgb({ h, s, v }: HsvColor): RgbColor {
  const hn = ((h % 360) + 360) % 360;
  const sn = clamp(s, 0, 100) / 100;
  const vn = clamp(v, 0, 100) / 100;

  const c = vn * sn;
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
  const m = vn - c;

  let rp = 0;
  let gp = 0;
  let bp = 0;

  if (hn < 60) {
    rp = c;
    gp = x;
  } else if (hn < 120) {
    rp = x;
    gp = c;
  } else if (hn < 180) {
    gp = c;
    bp = x;
  } else if (hn < 240) {
    gp = x;
    bp = c;
  } else if (hn < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }

  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255),
  };
}

function relativeLuminance({ r, g, b }: RgbColor): number {
  const linear = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(fg: RgbColor, bg: RgbColor): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Custom Theme-Aware RGB & Hex Color Picker Popover.
 * Replaces native browser `<input type="color">` OS dialogs with a portal-rendered
 * 2D saturation/brightness canvas, hue spectrum slider, individual R/G/B sliders +
 * numeric channels, hex entry, and live dark/light WCAG contrast diagnostics.
 */
export function ColorPickerDropdown({
  id,
  label = "Custom RGB / Hex Swatch",
  value,
  onChange,
  presets,
  disabled = false,
  hint,
  className,
}: ColorPickerDropdownProps) {
  const safeHex = useMemo(() => normalizeHex(value) || "#FF3B1D", [value]);
  const rgb = useMemo(() => hexToRgb(safeHex), [safeHex]);
  const [hsv, setHsv] = useState<HsvColor>(() => rgbToHsv(hexToRgb(safeHex)));
  const [hexDraft, setHexDraft] = useState<string>(safeHex);
  const padRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  // Sync external color updates (e.g. clicking a preset pill or Reset Defaults)
  useEffect(() => {
    const nextRgb = hexToRgb(safeHex);
    const frameId = requestAnimationFrame(() => {
      setHexDraft(safeHex);
      setHsv((prev) => {
        const computed = rgbToHsv(nextRgb);
        // Preserve user hue slider position when pure monochrome (s === 0 or v === 0)
        return {
          h: computed.s === 0 || computed.v === 0 ? prev.h : computed.h,
          s: computed.s,
          v: computed.v,
        };
      });
    });
    return () => cancelAnimationFrame(frameId);
  }, [safeHex]);

  const applyHsv = useCallback(
    (next: HsvColor) => {
      const clamped: HsvColor = {
        h: clamp(Math.round(next.h), 0, 360),
        s: clamp(Math.round(next.s), 0, 100),
        v: clamp(Math.round(next.v), 0, 100),
      };
      setHsv(clamped);
      const nextHex = rgbToHex(hsvToRgb(clamped));
      setHexDraft(nextHex);
      onChange(nextHex);
    },
    [onChange]
  );

  const applyRgbChannel = useCallback(
    (channel: keyof RgbColor, rawValue: number) => {
      const nextRgb: RgbColor = {
        ...rgb,
        [channel]: clamp(Math.round(rawValue || 0), 0, 255),
      };
      const nextHex = rgbToHex(nextRgb);
      setHexDraft(nextHex);
      setHsv((prev) => {
        const computed = rgbToHsv(nextRgb);
        return {
          ...computed,
          h: computed.s === 0 || computed.v === 0 ? prev.h : computed.h,
        };
      });
      onChange(nextHex);
    },
    [onChange, rgb]
  );

  const updateFromPadPointer = useCallback(
    (clientX: number, clientY: number) => {
      const el = padRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const xPct = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
      const yPct = clamp(((clientY - rect.top) / rect.height) * 100, 0, 100);
      applyHsv({
        h: hsv.h,
        s: xPct,
        v: 100 - yPct,
      });
    },
    [applyHsv, hsv.h]
  );

  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      updateFromPadPointer(e.clientX, e.clientY);
    };
    const handleUp = () => {
      draggingRef.current = false;
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [updateFromPadPointer]);

  const pureHueHex = useMemo(
    () => rgbToHex(hsvToRgb({ h: hsv.h, s: 100, v: 100 })),
    [hsv.h]
  );

  const darkContrast = useMemo(
    () => contrastRatio(rgb, { r: 8, g: 8, b: 10 }),
    [rgb]
  );
  const lightContrast = useMemo(
    () => contrastRatio(rgb, { r: 250, g: 248, b: 244 }),
    [rgb]
  );

  return (
    <FieldWrapper id={id} label={label} hint={hint} className={className}>
      <DropdownPopover
        portal
        align="start"
        minWidth={308}
        estimatedHeight={430}
        overflowMode="none"
        disabled={disabled}
        trigger={({ isOpen, toggle }) => (
          <button
            id={id}
            type="button"
            disabled={disabled}
            onClick={toggle}
            aria-expanded={isOpen}
            aria-label={`Open custom RGB and Hex color picker (current ${safeHex})`}
            className={cn(
              "w-full min-h-11 rounded-(--radius-control) border bg-(--bg-surface) px-3 py-2 flex items-center justify-between gap-2.5 text-left transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 disabled:cursor-not-allowed",
              isOpen
                ? "border-brand ring-2 ring-(--accent-ring)"
                : "border-(--border-strong) hover:border-brand/60"
            )}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <span
                className="w-7 h-7 rounded-(--radius-control) border border-(--border-strong) shrink-0 shadow-inner"
                style={{ backgroundColor: safeHex }}
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5">
                  <Pipette
                    className="w-3 h-3 text-(--text-accent) shrink-0"
                    aria-hidden="true"
                  />
                  <span className="text-xs font-mono font-bold text-(--text-primary) uppercase tracking-wider">
                    {safeHex}
                  </span>
                </span>
                <span className="block text-[10px] font-mono text-(--text-muted) truncate tabular-nums">
                  RGB({rgb.r}, {rgb.g}, {rgb.b}) · HSV({hsv.h}°, {hsv.s}%, {hsv.v}%)
                </span>
              </span>
            </span>

            <ChevronDown
              className={cn(
                "w-4 h-4 text-(--text-muted) shrink-0 transition-transform duration-200",
                isOpen && "rotate-180 text-(--text-accent)"
              )}
              aria-hidden="true"
            />
          </button>
        )}
      >
        {({ close }) => (
          <div className="p-3.5 space-y-3.5 select-none">
            {/* Popover Header */}
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-(--border-subtle)">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-5 h-5 rounded-(--radius-control) border border-(--border-strong) shrink-0"
                  style={{ backgroundColor: safeHex }}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <span className="text-[11px] font-mono uppercase tracking-[0.16em] font-semibold text-(--text-primary) block truncate">
                    RGB Spectrum Picker
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={close}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-(--radius-control) bg-brand text-brand-contrast hover:bg-brand-hover text-[10px] font-mono uppercase tracking-wider font-semibold transition-colors cursor-pointer shrink-0"
              >
                <Check className="w-3 h-3" aria-hidden="true" />
                <span>Done</span>
              </button>
            </div>

            {/* 2D Saturation × Brightness Spectrum Canvas */}
            <div
              ref={padRef}
              role="slider"
              tabIndex={0}
              aria-label="Saturation and brightness color pad"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(hsv.s)}
              aria-valuetext={`Saturation ${hsv.s} percent, brightness ${hsv.v} percent`}
              onPointerDown={(e) => {
                e.preventDefault();
                draggingRef.current = true;
                updateFromPadPointer(e.clientX, e.clientY);
              }}
              onKeyDown={(e) => {
                const step = e.shiftKey ? 5 : 2;
                if (e.key === "ArrowRight") {
                  e.preventDefault();
                  applyHsv({ ...hsv, s: hsv.s + step });
                } else if (e.key === "ArrowLeft") {
                  e.preventDefault();
                  applyHsv({ ...hsv, s: hsv.s - step });
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  applyHsv({ ...hsv, v: hsv.v + step });
                } else if (e.key === "ArrowDown") {
                  e.preventDefault();
                  applyHsv({ ...hsv, v: hsv.v - step });
                }
              }}
              className="relative w-full h-36 rounded-(--radius-control) border border-(--border-strong) overflow-hidden cursor-crosshair touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              style={{
                backgroundColor: pureHueHex,
                backgroundImage:
                  "linear-gradient(to top, #000000, rgba(0,0,0,0)), linear-gradient(to right, #ffffff, rgba(255,255,255,0))",
              }}
            >
              <span
                className="absolute w-4 h-4 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1.5px_rgba(0,0,0,0.85)] pointer-events-none"
                style={{
                  left: `${hsv.s}%`,
                  bottom: `${hsv.v}%`,
                  backgroundColor: safeHex,
                }}
              />
            </div>

            {/* Hue Slider */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] font-mono text-(--text-muted)">
                <span className="uppercase tracking-wider">Hue Angle</span>
                <span className="tabular-nums text-(--text-primary) font-semibold">
                  {hsv.h}°
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={360}
                value={hsv.h}
                onChange={(e) =>
                  applyHsv({ ...hsv, h: Number(e.target.value) })
                }
                aria-label="Hue angle"
                className="w-full h-2.5 rounded-full appearance-none cursor-pointer border border-(--border-strong)"
                style={{
                  background:
                    "linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)",
                }}
              />
            </div>

            {/* Individual RGB Sliders + Numeric Inputs */}
            <div className="space-y-2 pt-1 border-t border-(--border-subtle)">
              {(
                [
                  {
                    key: "r" as const,
                    label: "R",
                    gradient: `linear-gradient(to right, rgb(0,${rgb.g},${rgb.b}), rgb(255,${rgb.g},${rgb.b}))`,
                    val: rgb.r,
                  },
                  {
                    key: "g" as const,
                    label: "G",
                    gradient: `linear-gradient(to right, rgb(${rgb.r},0,${rgb.b}), rgb(${rgb.r},255,${rgb.b}))`,
                    val: rgb.g,
                  },
                  {
                    key: "b" as const,
                    label: "B",
                    gradient: `linear-gradient(to right, rgb(${rgb.r},${rgb.g},0), rgb(${rgb.r},${rgb.g},255))`,
                    val: rgb.b,
                  },
                ] as const
              ).map((ch) => (
                <div
                  key={ch.key}
                  className="grid grid-cols-[18px_1fr_52px] items-center gap-2"
                >
                  <span className="text-[11px] font-mono font-bold text-(--text-secondary) uppercase">
                    {ch.label}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={255}
                    value={ch.val}
                    onChange={(e) =>
                      applyRgbChannel(ch.key, Number(e.target.value))
                    }
                    aria-label={`${ch.label} channel slider`}
                    className="w-full h-2 rounded-full appearance-none cursor-pointer border border-(--border-subtle)"
                    style={{ background: ch.gradient }}
                  />
                  <input
                    type="number"
                    min={0}
                    max={255}
                    value={ch.val}
                    onChange={(e) =>
                      applyRgbChannel(ch.key, Number(e.target.value))
                    }
                    aria-label={`${ch.label} channel numeric value`}
                    className="w-full px-1.5 py-1 rounded-(--radius-control) border border-(--border-subtle) bg-(--bg-surface-2) text-[11px] font-mono text-(--text-primary) text-right tabular-nums focus:outline-none focus:border-brand"
                  />
                </div>
              ))}
            </div>

            {/* Direct Hex Input + WCAG Dark/Light Contrast Preview */}
            <div className="grid grid-cols-1 min-[340px]:grid-cols-2 gap-2 pt-1 border-t border-(--border-subtle)">
              <div>
                <label
                  htmlFor={`${id}-hex-input`}
                  className="block text-[9px] font-mono uppercase tracking-wider text-(--text-muted) mb-1"
                >
                  Hex Code
                </label>
                <input
                  id={`${id}-hex-input`}
                  type="text"
                  maxLength={7}
                  value={hexDraft}
                  onChange={(e) => {
                    const raw = e.target.value.toUpperCase();
                    setHexDraft(raw);
                    const normalized = normalizeHex(raw);
                    if (normalized) {
                      onChange(normalized);
                    }
                  }}
                  onBlur={() => setHexDraft(safeHex)}
                  placeholder="#FF3B1D"
                  className="w-full px-2.5 py-1.5 rounded-(--radius-control) border border-(--border-strong) bg-(--bg-surface-2) text-xs font-mono font-bold text-(--text-primary) uppercase focus:outline-none focus:border-brand"
                />
              </div>

              <div className="space-y-1">
                <span className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider text-(--text-muted)">
                  <Sparkles className="w-2.5 h-2.5 text-(--text-accent)" />
                  <span>Canvas Contrast</span>
                </span>
                <div className="grid grid-cols-2 gap-1 text-[10px] font-mono tabular-nums">
                  <div
                    className="px-2 py-1.5 rounded-(--radius-control) border border-(--border-subtle) flex items-center justify-between"
                    style={{ backgroundColor: "#08080A", color: safeHex }}
                  >
                    <span className="font-bold">D</span>
                    <span>{darkContrast.toFixed(1)}:1</span>
                  </div>
                  <div
                    className="px-2 py-1.5 rounded-(--radius-control) border border-(--border-subtle) flex items-center justify-between"
                    style={{ backgroundColor: "#FAF8F4", color: safeHex }}
                  >
                    <span className="font-bold">L</span>
                    <span>{lightContrast.toFixed(1)}:1</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Optional Quick Swatches */}
            {presets && presets.length > 0 && (
              <div className="pt-1.5 border-t border-(--border-subtle) space-y-1.5">
                <span className="block text-[9px] font-mono uppercase tracking-wider text-(--text-muted)">
                  Quick Presets
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {presets.map((preset) => {
                    const active =
                      preset.hex.toUpperCase() === safeHex.toUpperCase();
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => onChange(preset.hex)}
                        title={`${preset.label} (${preset.hex})`}
                        aria-label={`Select ${preset.label} swatch (${preset.hex})`}
                        className={cn(
                          "w-6 h-6 rounded-(--radius-control) border transition-transform cursor-pointer hover:scale-110",
                          active
                            ? "border-(--text-primary) ring-2 ring-brand scale-110"
                            : "border-(--border-strong)"
                        )}
                        style={{ backgroundColor: preset.hex }}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </DropdownPopover>
    </FieldWrapper>
  );
}
