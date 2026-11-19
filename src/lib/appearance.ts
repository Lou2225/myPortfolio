import { ACCENT_PRESETS, DEFAULT_APPEARANCE } from "@/data/appearance";
import { sanitizeImageTransform } from "@/lib/imageTransform";
import { sanitizeCursorAssetUrl } from "@/lib/inputValidation";
import type {
  AppearanceConfig,
  CursorSizeMode,
  JumpscareTriggerMode,
  PortfolioTheme,
  PortfolioThemeMode,
} from "@/types/portfolio";

const THEME_OVERRIDE_STORAGE_KEY = "lou_portfolio_theme";
const MOTION_OVERRIDE_STORAGE_KEY = "lou_portfolio_motion_override";
export const PRELOADER_SEEN_SESSION_KEY = "lou_portfolio_preloader_seen";
export const APPEARANCE_SYNC_EVENT = "lou-appearance-sync";

export type DeviceThemeOverride = "site-default" | PortfolioThemeMode;
export type DeviceMotionOverride = "site-default" | "reduced";

export interface DerivedAccentPalette {
  accent: string;
  hover: string;
  deep: string;
  solidBg: string;
  solidHover: string;
  contrastInk: "#ffffff" | "#08080a";
  textOnDark: string;
  textOnLight: string;
  glowRgba: string;
  badgeBgRgba: string;
  ringRgba: string;
  contrastOnDarkCanvas: number;
  contrastOnLightCanvas: number;
  contrastOnButton: number;
}

const DARK_CANVAS = "#08080a";
const LIGHT_CANVAS = "#f5f2eb";

export function normalizeHexColor(
  raw: string | undefined | null,
  fallback = "#ff3b1d"
): string {
  const clean = (raw || "").trim();
  const match = /^#?([0-9a-fA-F]{6})$/.exec(clean);
  if (match) {
    return `#${match[1].toLowerCase()}`;
  }
  const shortMatch = /^#?([0-9a-fA-F]{3})$/.exec(clean);
  if (shortMatch) {
    const [r, g, b] = shortMatch[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return fallback;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = normalizeHexColor(hex).slice(1);
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${clamp(r)}${clamp(g)}${clamp(b)}`;
}

function mixHexColors(hexA: string, hexB: string, ratioB: number): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const t = Math.max(0, Math.min(1, ratioB));
  return rgbToHex(
    a.r + (b.r - a.r) * t,
    a.g + (b.g - a.g) * t,
    a.b + (b.b - a.b) * t
  );
}

function getRelativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const convert = (channel: number) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * convert(r) + 0.7152 * convert(g) + 0.0722 * convert(b)
  );
}

function getContrastRatio(hexA: string, hexB: string): number {
  const l1 = getRelativeLuminance(hexA);
  const l2 = getRelativeLuminance(hexB);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Resolves the active accent hex string from AppearanceConfig.
 */
export function resolveAccentBaseHex(appearance: AppearanceConfig): string {
  if (appearance.accentPreset === "custom") {
    return normalizeHexColor(appearance.customAccentHex, "#ff3b1d");
  }
  const found = ACCENT_PRESETS.find((p) => p.id === appearance.accentPreset);
  return found ? found.hex : "#ff3b1d";
}

function tuneColorContrastAgainstBg(
  colorHex: string,
  bgHex: string,
  targetHex: string,
  minContrast: number
): string {
  if (getContrastRatio(colorHex, bgHex) >= minContrast) {
    return colorHex;
  }
  for (let step = 0.08; step <= 0.88; step += 0.08) {
    const mixed = mixHexColors(colorHex, targetHex, step);
    if (getContrastRatio(mixed, bgHex) >= minContrast) {
      return mixed;
    }
  }
  return mixHexColors(colorHex, targetHex, 0.55);
}

/**
 * Computes full contrast-checked CSS variables for any preset or custom hex.
 */
export function resolveAccentPalette(baseHexInput: string): DerivedAccentPalette {
  const accent = normalizeHexColor(baseHexInput);
  const { r, g, b } = hexToRgb(accent);

  // Darken toward obsidian canvas for rich hover & deep gradients;
  // if accent itself is ultra-dark, lift gently so hover remains perceptible.
  const lum = getRelativeLuminance(accent);
  const hover =
    lum < 0.08
      ? mixHexColors(accent, "#ffffff", 0.14)
      : mixHexColors(accent, DARK_CANVAS, 0.14);
  const deep =
    lum < 0.08
      ? mixHexColors(accent, DARK_CANVAS, 0.25)
      : mixHexColors(accent, DARK_CANVAS, 0.32);

  const whiteContrast = getContrastRatio(accent, "#ffffff");
  const darkContrast = getContrastRatio(accent, DARK_CANVAS);
  // Keep crisp white on vibrant mid-tones (Vermilion 3.6:1, Emerald 3.8:1, Cobalt 5.2:1)
  // and switch to deep Obsidian ink only on bright pastels/yellows.
  const contrastInk: "#ffffff" | "#08080a" =
    whiteContrast >= 3.0 || whiteContrast >= darkContrast
      ? "#ffffff"
      : "#08080a";

  // Solid interactive button/tab background guaranteed >= 4.65:1 AA against contrastInk
  // while leaving vibrant --accent untouched for borders, dots, glows, and display typography.
  const solidBg =
    contrastInk === "#ffffff"
      ? tuneColorContrastAgainstBg(accent, "#ffffff", DARK_CANVAS, 4.65)
      : tuneColorContrastAgainstBg(accent, DARK_CANVAS, "#ffffff", 4.65);
  const solidHover =
    contrastInk === "#ffffff"
      ? mixHexColors(solidBg, "#000000", 0.14)
      : mixHexColors(solidBg, "#ffffff", 0.12);

  const textOnDark = tuneColorContrastAgainstBg(
    accent,
    DARK_CANVAS,
    "#ffffff",
    4.6
  );
  const textOnLight = tuneColorContrastAgainstBg(
    accent,
    LIGHT_CANVAS,
    DARK_CANVAS,
    4.55
  );

  return {
    accent,
    hover,
    deep,
    solidBg,
    solidHover,
    contrastInk,
    textOnDark,
    textOnLight,
    glowRgba: `rgba(${r}, ${g}, ${b}, 0.28)`,
    badgeBgRgba: `rgba(${r}, ${g}, ${b}, 0.12)`,
    ringRgba: `rgba(${r}, ${g}, ${b}, 0.18)`,
    contrastOnDarkCanvas: Number(
      getContrastRatio(textOnDark, DARK_CANVAS).toFixed(2)
    ),
    contrastOnLightCanvas: Number(
      getContrastRatio(textOnLight, LIGHT_CANVAS).toFixed(2)
    ),
    contrastOnButton: Number(
      getContrastRatio(solidBg, contrastInk).toFixed(2)
    ),
  };
}

/**
 * Resolves effective `"dark" | "light"` theme considering per-device override and OS color-scheme.
 */
export function resolveEffectiveTheme(
  siteDefault: PortfolioThemeMode,
  deviceOverride?: DeviceThemeOverride | null
): PortfolioTheme {
  const mode: PortfolioThemeMode =
    deviceOverride && deviceOverride !== "site-default"
      ? deviceOverride
      : siteDefault;

  if (mode === "light") return "light";
  if (mode === "dark") return "dark";

  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
  ) {
    return window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }

  return "dark";
}

export function getStoredDeviceThemeOverride(): DeviceThemeOverride {
  if (typeof window === "undefined") return "site-default";
  try {
    const raw = window.localStorage.getItem(THEME_OVERRIDE_STORAGE_KEY);
    if (raw === "dark" || raw === "light" || raw === "system") {
      return raw;
    }
  } catch {
    // Ignore storage restriction
  }
  return "site-default";
}

export function setStoredDeviceThemeOverride(next: DeviceThemeOverride): void {
  if (typeof window === "undefined") return;
  try {
    if (next === "site-default") {
      window.localStorage.removeItem(THEME_OVERRIDE_STORAGE_KEY);
    } else {
      window.localStorage.setItem(THEME_OVERRIDE_STORAGE_KEY, next);
    }
  } catch {
    // Ignore storage restriction
  }
}

export function getStoredDeviceMotionOverride(): DeviceMotionOverride {
  if (typeof window === "undefined") return "site-default";
  try {
    const raw = window.localStorage.getItem(MOTION_OVERRIDE_STORAGE_KEY);
    if (raw === "reduced") return "reduced";
  } catch {
    // Ignore storage restriction
  }
  return "site-default";
}

export function setStoredDeviceMotionOverride(
  next: DeviceMotionOverride
): void {
  if (typeof window === "undefined") return;
  try {
    if (next === "site-default") {
      window.localStorage.removeItem(MOTION_OVERRIDE_STORAGE_KEY);
    } else {
      window.localStorage.setItem(MOTION_OVERRIDE_STORAGE_KEY, next);
    }
  } catch {
    // Ignore storage restriction
  }
}

/**
 * Evaluates effective reduced motion preference across site policy, per-device override, and OS setting.
 */
export function resolveEffectiveReducedMotion(
  appearance?: AppearanceConfig | null,
  deviceOverride?: DeviceMotionOverride | null
): boolean {
  const override =
    deviceOverride ??
    (typeof window !== "undefined" ? getStoredDeviceMotionOverride() : "site-default");

  if (override === "reduced") return true;

  const siteMode = appearance?.motionMode ?? "system";
  if (siteMode === "reduced") return true;
  if (siteMode === "full") return false;

  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
  ) {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  return false;
}

/**
 * Lightweight imperative check used by GSAP triggers & micro-animations outside React hooks.
 * Falls back cleanly to `data-motion="reduced"` set on `<html>` + OS media query.
 */
export function shouldReduceMotion(): boolean {
  if (typeof document !== "undefined") {
    if (document.documentElement.getAttribute("data-motion") === "reduced") {
      return true;
    }
    if (document.documentElement.getAttribute("data-motion") === "full") {
      return false;
    }
  }
  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
  ) {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  return false;
}

const ALLOWED_CURSOR_SIZES = new Set<number>([32, 48, 64, 96]);

export function clampCursorHotspot(raw: unknown, fallback = 4): number {
  const num = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(128, Math.round(num)));
}

export function normalizeCursorSize(raw: unknown): CursorSizeMode {
  const num = typeof raw === "number" ? raw : Number(raw);
  return ALLOWED_CURSOR_SIZES.has(num) ? (num as CursorSizeMode) : 48;
}

/**
 * Formats a sanitized CSS `cursor` value safely. When `targetSize` and `sourceWidth`
 * differ on raster assets (`.png`/`.webp`), uses `image-set(url(...) Xx)` so switching
 * cursor size scales cleanly from the crisp master upload without re-uploading.
 */
export function buildCssCursorValue(
  rawUrl: string | undefined | null,
  fallback: "auto" | "pointer",
  hotspotX = 4,
  hotspotY = 4,
  targetSize?: CursorSizeMode,
  sourceWidth?: number
): string {
  const safeUrl = sanitizeCursorAssetUrl(rawUrl);
  if (!safeUrl) return fallback;
  const hx = clampCursorHotspot(hotspotX, 4);
  const hy = clampCursorHotspot(hotspotY, 4);
  const isNativeBinary = /\.(cur|ico)(?:$|\?)/i.test(safeUrl);

  if (
    !isNativeBinary &&
    targetSize &&
    sourceWidth &&
    sourceWidth >= 16 &&
    sourceWidth !== targetSize
  ) {
    const dppx = Number(
      Math.max(0.25, Math.min(4, sourceWidth / targetSize)).toFixed(4)
    );
    if (dppx !== 1) {
      return `image-set(url("${safeUrl}") ${dppx}x) ${hx} ${hy}, ${fallback}`;
    }
  }

  return `url("${safeUrl}") ${hx} ${hy}, ${fallback}`;
}

export function resolveCursorCssVars(
  appearanceInput?: Partial<AppearanceConfig> | null
): {
  active: boolean;
  defaultCss: string;
  defaultFallbackCss: string;
  pointerCss: string;
  pointerFallbackCss: string;
} {
  if (!appearanceInput?.customCursorEnabled) {
    return {
      active: false,
      defaultCss: "auto",
      defaultFallbackCss: "auto",
      pointerCss: "pointer",
      pointerFallbackCss: "pointer",
    };
  }

  const defaultUrl = sanitizeCursorAssetUrl(appearanceInput.customCursorDefaultUrl);
  const pointerUrl =
    sanitizeCursorAssetUrl(appearanceInput.customCursorPointerUrl) || defaultUrl;

  if (!defaultUrl && !pointerUrl) {
    return {
      active: false,
      defaultCss: "auto",
      defaultFallbackCss: "auto",
      pointerCss: "pointer",
      pointerFallbackCss: "pointer",
    };
  }

  const targetSize = normalizeCursorSize(appearanceInput.customCursorSize ?? 48);
  const defaultSourceWidth =
    typeof appearanceInput.customCursorDefaultSourceSize === "number" &&
    appearanceInput.customCursorDefaultSourceSize >= 16
      ? appearanceInput.customCursorDefaultSourceSize
      : undefined;
  const pointerSourceWidth =
    typeof appearanceInput.customCursorPointerSourceSize === "number" &&
    appearanceInput.customCursorPointerSourceSize >= 16
      ? appearanceInput.customCursorPointerSourceSize
      : appearanceInput.customCursorPointerUrl
        ? undefined
        : defaultSourceWidth;

  const hx = clampCursorHotspot(appearanceInput.customCursorHotspotX, 4);
  const hy = clampCursorHotspot(appearanceInput.customCursorHotspotY, 4);

  return {
    active: true,
    defaultFallbackCss: defaultUrl
      ? buildCssCursorValue(defaultUrl, "auto", hx, hy)
      : "auto",
    defaultCss: defaultUrl
      ? buildCssCursorValue(
          defaultUrl,
          "auto",
          hx,
          hy,
          targetSize,
          defaultSourceWidth
        )
      : "auto",
    pointerFallbackCss: pointerUrl
      ? buildCssCursorValue(pointerUrl, "pointer", hx, hy)
      : "pointer",
    pointerCss: pointerUrl
      ? buildCssCursorValue(
          pointerUrl,
          "pointer",
          hx,
          hy,
          targetSize,
          pointerSourceWidth
        )
      : "pointer",
  };
}

/**
 * Resolves full appearance state and applies semantic `data-*` attributes,
 * canvas texture, navbar style, cursor state, and motion flags onto `<html>`.
 */
export function applyAppearanceToDocument(
  appearanceInput?: Partial<AppearanceConfig> | null,
  options?: {
    deviceThemeOverride?: DeviceThemeOverride;
    deviceMotionOverride?: DeviceMotionOverride;
    pathname?: string;
  }
): {
  effectiveTheme: PortfolioTheme;
  effectiveReducedMotion: boolean;
  palette: DerivedAccentPalette;
} {
  const appearance = sanitizeAppearanceConfig(appearanceInput);

  const deviceThemeOverride =
    options?.deviceThemeOverride ?? getStoredDeviceThemeOverride();
  const deviceMotionOverride =
    options?.deviceMotionOverride ?? getStoredDeviceMotionOverride();

  const effectiveTheme = resolveEffectiveTheme(
    appearance.defaultTheme,
    deviceThemeOverride
  );
  const effectiveReducedMotion = resolveEffectiveReducedMotion(
    appearance,
    deviceMotionOverride
  );

  const baseHex = resolveAccentBaseHex(appearance);
  const palette = resolveAccentPalette(baseHex);
  const cursorVars = resolveCursorCssVars(appearance);

  if (typeof document !== "undefined") {
    const root = document.documentElement;
    const activePath =
      options?.pathname ??
      (typeof window !== "undefined" ? window.location.pathname : "/");
    const routeScope = activePath.startsWith("/admin") ? "admin" : "public";
    const setAttr = (name: string, val: string) => {
      if (root.getAttribute(name) !== val) {
        root.setAttribute(name, val);
      }
    };
    const setVar = (name: string, val: string) => {
      if (root.style.getPropertyValue(name) !== val) {
        root.style.setProperty(name, val);
      }
    };

    setAttr("data-route-scope", routeScope);
    setAttr("data-custom-cursor", cursorVars.active ? "on" : "off");
    setAttr("data-theme", effectiveTheme);
    const shouldDark = effectiveTheme === "dark";
    if (root.classList.contains("dark") !== shouldDark) {
      root.classList.toggle("dark", shouldDark);
    }
    const shouldLight = effectiveTheme === "light";
    if (root.classList.contains("light") !== shouldLight) {
      root.classList.toggle("light", shouldLight);
    }

    setAttr("data-font", appearance.fontPairing);
    setAttr("data-scale", appearance.displayScale);
    setAttr("data-radius", appearance.surfaceRadius);
    setAttr("data-texture", appearance.canvasTexture);
    setAttr("data-navbar", appearance.navbarStyle);
    setAttr("data-image-tone", appearance.imageColorMode);
    setAttr("data-motion", effectiveReducedMotion ? "reduced" : "full");

    setVar("--accent", palette.accent);
    setVar("--accent-hover", palette.hover);
    setVar("--accent-deep", palette.deep);
    setVar("--accent-solid", palette.solidBg);
    setVar("--accent-solid-hover", palette.solidHover);
    setVar("--accent-contrast", palette.contrastInk);
    setVar("--accent-glow", palette.glowRgba);
    setVar("--bg-badge-highlight", palette.badgeBgRgba);
    setVar("--accent-ring", palette.ringRgba);
    setVar("--lou-cursor-default-fallback", cursorVars.defaultFallbackCss);
    setVar("--lou-cursor-default", cursorVars.defaultCss);
    setVar("--lou-cursor-pointer-fallback", cursorVars.pointerFallbackCss);
    setVar("--lou-cursor-pointer", cursorVars.pointerCss);
    setVar(
      "--text-accent",
      effectiveTheme === "light" ? palette.textOnLight : palette.textOnDark
    );

    // Sync browser mobile theme-color meta tag
    const metaTheme = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]:not([media])'
    );
    const nextBarColor =
      effectiveTheme === "light" ? LIGHT_CANVAS : DARK_CANVAS;
    if (metaTheme && metaTheme.content !== nextBarColor) {
      metaTheme.content = nextBarColor;
    }
  }

  return { effectiveTheme, effectiveReducedMotion, palette };
}

export function sanitizeAppearanceConfig(
  raw?: Partial<AppearanceConfig> | null
): AppearanceConfig {
  const cleaned = {
    ...DEFAULT_APPEARANCE,
    ...(raw || {}),
    ambientStarfield:
      raw?.ambientStarfield ?? DEFAULT_APPEARANCE.ambientStarfield ?? true,
    customCursorEnabled: Boolean(raw?.customCursorEnabled),
    customCursorDefaultUrl: sanitizeCursorAssetUrl(raw?.customCursorDefaultUrl),
    customCursorPointerUrl: sanitizeCursorAssetUrl(raw?.customCursorPointerUrl),
    customCursorDefaultTransform: raw?.customCursorDefaultTransform
      ? sanitizeImageTransform(raw.customCursorDefaultTransform, "squircle")
      : undefined,
    customCursorPointerTransform: raw?.customCursorPointerTransform
      ? sanitizeImageTransform(raw.customCursorPointerTransform, "squircle")
      : undefined,
    customCursorDefaultSourceSize:
      typeof raw?.customCursorDefaultSourceSize === "number" &&
      Number.isFinite(raw.customCursorDefaultSourceSize)
        ? Math.max(16, Math.min(512, Math.round(raw.customCursorDefaultSourceSize)))
        : undefined,
    customCursorPointerSourceSize:
      typeof raw?.customCursorPointerSourceSize === "number" &&
      Number.isFinite(raw.customCursorPointerSourceSize)
        ? Math.max(16, Math.min(512, Math.round(raw.customCursorPointerSourceSize)))
        : undefined,
    customCursorSize: normalizeCursorSize(
      raw?.customCursorSize ?? DEFAULT_APPEARANCE.customCursorSize
    ),
    customCursorHotspotX: clampCursorHotspot(
      raw?.customCursorHotspotX,
      DEFAULT_APPEARANCE.customCursorHotspotX ?? 4
    ),
    customCursorHotspotY: clampCursorHotspot(
      raw?.customCursorHotspotY,
      DEFAULT_APPEARANCE.customCursorHotspotY ?? 4
    ),
    jumpscareEnabled: Boolean(raw?.jumpscareEnabled),
    jumpscareTrigger: (
      raw?.jumpscareTrigger === "get-in-touch" ||
      raw?.jumpscareTrigger === "prank-link" ||
      raw?.jumpscareTrigger === "first-click" ||
      raw?.jumpscareTrigger === "secret-taps"
        ? raw.jumpscareTrigger
        : "secret-taps"
    ) as JumpscareTriggerMode,
    jumpscareImageUrl: sanitizeCursorAssetUrl(raw?.jumpscareImageUrl),
    jumpscareImageTransform: raw?.jumpscareImageTransform
      ? sanitizeImageTransform(raw.jumpscareImageTransform, "squircle")
      : undefined,
    jumpscareAudioUrl: sanitizeCursorAssetUrl(raw?.jumpscareAudioUrl),
    jumpscareVolume:
      typeof raw?.jumpscareVolume === "number" && Number.isFinite(raw.jumpscareVolume)
        ? Math.max(0, Math.min(1, Number(raw.jumpscareVolume.toFixed(2))))
        : 0.65,
    jumpscareCaption:
      typeof raw?.jumpscareCaption === "string"
        ? raw.jumpscareCaption.trim().slice(0, 80)
        : "GOTCHA.",
    customAccentHex: normalizeHexColor(
      raw?.customAccentHex,
      DEFAULT_APPEARANCE.customAccentHex
    ),
  } as AppearanceConfig & { customCursor?: unknown };
  delete cleaned.customCursor;
  if (!cleaned.customCursorDefaultTransform) {
    delete cleaned.customCursorDefaultTransform;
  }
  if (!cleaned.customCursorPointerTransform) {
    delete cleaned.customCursorPointerTransform;
  }
  if (!cleaned.customCursorDefaultSourceSize) {
    delete cleaned.customCursorDefaultSourceSize;
  }
  if (!cleaned.customCursorPointerSourceSize) {
    delete cleaned.customCursorPointerSourceSize;
  }
  if (!cleaned.jumpscareImageTransform) {
    delete cleaned.jumpscareImageTransform;
  }
  return cleaned;
}

/**
 * Generates an inline pre-paint script embedded in `<head>` by `RootLayout`
 * so `data-theme`, `data-font`, `data-radius`, `data-motion`, cursor variables,
 * and accent CSS variables resolve BEFORE first paint without FOUC.
 */
export function buildPrePaintAppearanceScript(
  appearance: AppearanceConfig
): string {
  const safe = sanitizeAppearanceConfig(appearance);
  const palette = resolveAccentPalette(resolveAccentBaseHex(safe));
  const cursorVars = resolveCursorCssVars(safe);

  const payload = JSON.stringify({
    defaultTheme: safe.defaultTheme,
    fontPairing: safe.fontPairing,
    displayScale: safe.displayScale,
    surfaceRadius: safe.surfaceRadius,
    canvasTexture: safe.canvasTexture,
    navbarStyle: safe.navbarStyle,
    imageColorMode: safe.imageColorMode,
    motionMode: safe.motionMode,
    palette,
    cursorVars,
  });

  return `(()=>{try{var c=${payload};var d=document.documentElement;var tKey=${JSON.stringify(
    THEME_OVERRIDE_STORAGE_KEY
  )};var mKey=${JSON.stringify(
    MOTION_OVERRIDE_STORAGE_KEY
  )};var st=localStorage.getItem(tKey);var tMode=(st==="dark"||st==="light"||st==="system")?st:c.defaultTheme;var effT=tMode==="light"?"light":tMode==="dark"?"dark":(window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");var sm=localStorage.getItem(mKey);var sysRed=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;var effRed=sm==="reduced"||c.motionMode==="reduced"||(c.motionMode==="system"&&sysRed);var scope=window.location&&window.location.pathname&&window.location.pathname.indexOf("/admin")===0?"admin":"public";d.setAttribute("data-route-scope",scope);d.setAttribute("data-custom-cursor",c.cursorVars&&c.cursorVars.active?"on":"off");d.setAttribute("data-theme",effT);d.classList.toggle("dark",effT==="dark");d.classList.toggle("light",effT==="light");d.setAttribute("data-font",c.fontPairing);d.setAttribute("data-scale",c.displayScale);d.setAttribute("data-radius",c.surfaceRadius);d.setAttribute("data-texture",c.canvasTexture);d.setAttribute("data-navbar",c.navbarStyle);d.setAttribute("data-image-tone",c.imageColorMode);d.setAttribute("data-motion",effRed?"reduced":"full");var p=c.palette;d.style.setProperty("--accent",p.accent);d.style.setProperty("--accent-hover",p.hover);d.style.setProperty("--accent-deep",p.deep);d.style.setProperty("--accent-solid",p.solidBg);d.style.setProperty("--accent-solid-hover",p.solidHover);d.style.setProperty("--accent-contrast",p.contrastInk);d.style.setProperty("--accent-glow",p.glowRgba);d.style.setProperty("--bg-badge-highlight",p.badgeBgRgba);d.style.setProperty("--accent-ring",p.ringRgba);if(c.cursorVars){d.style.setProperty("--lou-cursor-default-fallback",c.cursorVars.defaultFallbackCss);d.style.setProperty("--lou-cursor-default",c.cursorVars.defaultCss);d.style.setProperty("--lou-cursor-pointer-fallback",c.cursorVars.pointerFallbackCss);d.style.setProperty("--lou-cursor-pointer",c.cursorVars.pointerCss);}d.style.setProperty("--text-accent",effT==="light"?p.textOnLight:p.textOnDark);}catch(_){}})();`;
}

