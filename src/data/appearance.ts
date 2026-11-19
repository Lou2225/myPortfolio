import type {
  AccentPresetId,
  AppearanceConfig,
  FontPairingId,
  SurfaceRadiusMode,
} from "@/types/portfolio";

export interface AccentPresetMeta {
  id: Exclude<AccentPresetId, "custom">;
  name: string;
  tagline: string;
  hex: string;
}

export interface FontPairingMeta {
  id: FontPairingId;
  name: string;
  displayLabel: string;
  sansLabel: string;
  description: string;
  sampleHeadline: string;
}

export interface SurfaceRadiusMeta {
  id: SurfaceRadiusMode;
  name: string;
  pxCard: string;
  pxControl: string;
  description: string;
}

export const ACCENT_PRESETS: readonly AccentPresetMeta[] = [
  {
    id: "vermilion",
    name: "Vermilion Signature",
    tagline: "Cinematic red-orange highlight tailored for Obsidian Dark",
    hex: "#ff3b1d",
  },
  {
    id: "ember",
    name: "Amber Ember",
    tagline: "Warm solar orange for bold architectural highlights",
    hex: "#ea580c",
  },
  {
    id: "cobalt",
    name: "Electric Cobalt",
    tagline: "Crisp engineering blue for technical & SaaS flair",
    hex: "#2563eb",
  },
  {
    id: "emerald",
    name: "Signal Emerald",
    tagline: "High-precision analytics green with clean editorial tone",
    hex: "#059669",
  },
  {
    id: "violet",
    name: "Ultraviolet",
    tagline: "Modern product studio indigo-violet accent",
    hex: "#7c3aed",
  },
  {
    id: "crimson",
    name: "Editorial Crimson",
    tagline: "Sharp rose-crimson highlight with high Daylight contrast",
    hex: "#e11d48",
  },
];

export const FONT_PAIRINGS: readonly FontPairingMeta[] = [
  {
    id: "editorial",
    name: "Editorial Signature",
    displayLabel: "Anton",
    sansLabel: "Onest",
    description: "Tall condensed poster impact paired with warm geometric sans",
    sampleHeadline: "SYSTEMS BUILT END-TO-END",
  },
  {
    id: "geometric",
    name: "Tech Geometric",
    displayLabel: "Space Grotesk",
    sansLabel: "Plus Jakarta Sans",
    description: "Sharp geometric studio headlines with ultra-clean product body",
    sampleHeadline: "PRECISION IN CODE",
  },
  {
    id: "monolith",
    name: "Swiss Monolith",
    displayLabel: "Bebas Neue",
    sansLabel: "Inter",
    description: "Architectural tabular rhythm with classic neutral legibility",
    sampleHeadline: "DATA TO INTERFACE",
  },
];

export const RADIUS_PRESETS: readonly SurfaceRadiusMeta[] = [
  {
    id: "sharp",
    name: "Editorial Sharp",
    pxCard: "2px",
    pxControl: "2px",
    description: "Crisp 2px Swiss hairline cards & containers",
  },
  {
    id: "balanced",
    name: "Modern Balanced",
    pxCard: "8px",
    pxControl: "6px",
    description: "Tactile 8px studio corners across cards & forms",
  },
  {
    id: "soft",
    name: "Soft Surface",
    pxCard: "14px",
    pxControl: "10px",
    description: "Smooth rounded cards for a softer spatial feel",
  },
];

export const DEFAULT_APPEARANCE: AppearanceConfig = {
  defaultTheme: "dark",
  accentPreset: "vermilion",
  customAccentHex: "#ff3b1d",
  fontPairing: "editorial",
  displayScale: "standard",
  surfaceRadius: "sharp",
  canvasTexture: "clean",
  navbarStyle: "glass",
  motionMode: "system",
  smoothScroll: true,
  preloaderMode: "once-per-session",
  marqueeSpeed: "normal",
  magneticCursor: true,
  liquidDistortion: true,
  imageColorMode: "grayscale-hover",
  heroRimGlow: true,
  ambientStarfield: true,
  projectsLayout: "staggered",
  customCursorEnabled: false,
  customCursorDefaultUrl: "",
  customCursorPointerUrl: "",
  customCursorSize: 48,
  customCursorHotspotX: 4,
  customCursorHotspotY: 4,
  jumpscareEnabled: false,
  jumpscareTrigger: "secret-taps",
  jumpscareImageUrl: "",
  jumpscareAudioUrl: "",
  jumpscareVolume: 0.65,
  jumpscareCaption: "GOTCHA.",
};

