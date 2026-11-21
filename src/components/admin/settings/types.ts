import type { SettingsSectionId } from "@/components/admin/layout/types";

export interface SettingsFeedback {
  type: "error";
  message: string;
}

export interface SettingsSectionMeta {
  id: Exclude<SettingsSectionId, "hub">;
  group: "account" | "workspace" | "system";
  title: string;
  subtitle: string;
  eyebrow: string;
  keywords: string[];
}

export const SETTINGS_SECTIONS_META: readonly SettingsSectionMeta[] = [
  {
    id: "password",
    group: "account",
    eyebrow: "Account & Credentials",
    title: "Password & Credentials",
    subtitle:
      "Update administrator sign-in password, hashing posture & environment fallback",
    keywords: [
      "password",
      "credentials",
      "login",
      "auth",
      "scrypt",
      "env",
      "revert",
    ],
  },
  {
    id: "security",
    group: "account",
    eyebrow: "Access Control",
    title: "Security & Access Control",
    subtitle:
      "Trusted devices, hardware passkeys, Authenticator 2FA, QR pairing, stealth gate & audit log",
    keywords: [
      "security",
      "device",
      "portal",
      "trust",
      "session",
      "cookie",
      "logout",
      "sign out",
      "qr",
      "mobile",
      "pair",
      "6-digit",
      "stealth",
      "404",
      "revoke",
      "audit",
      "hardware",
      "gpu",
      "fingerprint",
      "passkey",
      "webauthn",
      "biometrics",
      "windows hello",
      "touch id",
      "face id",
      "2fa",
      "totp",
      "authenticator",
      "otp",
    ],
  },
  {
    id: "appearance",
    group: "workspace",
    eyebrow: "Personalization",
    title: "Appearance & Theme",
    subtitle:
      "Site theme, brand accent palette, typography, motion, custom cursors, starfield & Easter eggs",
    keywords: [
      "appearance",
      "theme",
      "dark",
      "light",
      "obsidian",
      "daylight",
      "personalization",
      "colors",
      "accent",
      "hex",
      "font",
      "typography",
      "radius",
      "corners",
      "texture",
      "grid",
      "glass",
      "navbar",
      "preloader",
      "marquee",
      "magnetic",
      "liquid",
      "hover",
      "smooth scroll",
      "reduced motion",
      "wcag",
      "contrast",
      "cursor",
      "pointer",
      "hotspot",
      "starfield",
      "stars",
      "ambient",
      "jumpscare",
      "prank",
      "easter egg",
      "audio",
      "sound",
    ],
  },
  {
    id: "pwa",
    group: "workspace",
    eyebrow: "PWA & Caching",
    title: "Offline Cache & PWA",
    subtitle:
      "Service worker tiers, storage quota, offline pre-warm, outbox queue & install posture",
    keywords: [
      "offline",
      "pwa",
      "cache",
      "service worker",
      "install",
      "outbox",
      "network",
      "quota",
      "storage",
      "prewarm",
      "update",
    ],
  },
  {
    id: "database",
    group: "system",
    eyebrow: "Storage & Portability",
    title: "Database & Backups",
    subtitle:
      "Engine health probe, rolling vault checkpoints, SHA-256 export & selective restore",
    keywords: [
      "database",
      "supabase",
      "json",
      "backup",
      "export",
      "import",
      "restore",
      "inventory",
      "snapshot",
      "checkpoint",
      "health",
      "sha256",
    ],
  },
  {
    id: "maintenance",
    group: "system",
    eyebrow: "Maintenance & Reset",
    title: "Maintenance & Danger Zone",
    subtitle:
      "Server cache flush, analytics retention, read inbox purge, orphan media scan & reset",
    keywords: [
      "maintenance",
      "danger",
      "reset",
      "seed",
      "factory",
      "clear",
      "analytics",
      "retention",
      "flush",
      "orphan",
      "media",
      "inbox",
      "delete",
    ],
  },
];

export const SETTINGS_GROUP_LABELS: Record<
  SettingsSectionMeta["group"],
  string
> = {
  account: "Account & Security",
  workspace: "Workspace & Experience",
  system: "Data & System",
};

export interface SettingsRecommendationItem {
  id: string;
  section: Exclude<SettingsSectionId, "hub">;
  title: string;
  description: string;
  keywords: string[];
  popular?: boolean;
}

export const SETTINGS_RECOMMENDATIONS: readonly SettingsRecommendationItem[] = [
  {
    id: "rec-change-password",
    section: "password",
    title: "Change Administrator Password",
    description: "Set a custom salted scrypt administrator password",
    keywords: ["password", "change", "credentials", "login", "scrypt"],
    popular: true,
  },
  {
    id: "rec-revert-env-password",
    section: "password",
    title: "Revert to Environment Password",
    description: "Fall back to process.env.ADMIN_PASSWORD",
    keywords: ["env", "environment", "revert", "ADMIN_PASSWORD", "fallback"],
  },
  {
    id: "rec-theme-selector",
    section: "appearance",
    title: "Site Theme, Accent Palette & Custom Hex",
    description: "Publish Obsidian/Daylight default canvas, preset colors or WCAG-checked custom hex",
    keywords: ["theme", "dark", "light", "obsidian", "daylight", "colors", "accent", "hex", "palette", "contrast", "appearance"],
    popular: true,
  },
  {
    id: "rec-typography-surfaces",
    section: "appearance",
    title: "Typography Pairing, Corners & Canvas Texture",
    description: "Switch Anton/Space Grotesk/Bebas fonts, card radii, blueprint grid & navbar frost",
    keywords: ["font", "typography", "anton", "space grotesk", "bebas", "scale", "radius", "corners", "texture", "grid", "dots", "glass"],
  },
  {
    id: "rec-motion-posture",
    section: "appearance",
    title: "Motion, Lenis Scroll, Preloader & Ambient Starfield",
    description: "Configure GSAP animations, ambient starfield, magnetic pull, hover FX & reduced motion",
    keywords: ["motion", "animation", "reduced", "transitions", "gsap", "lenis", "preloader", "marquee", "magnetic", "liquid", "hover", "fps", "starfield", "stars", "ambient"],
  },
  {
    id: "rec-custom-cursor-fx",
    section: "appearance",
    title: "Uploaded Custom Cursor Pack & Jumpscare Prank Mode",
    description: "Upload .png/.cur cursors with hotspot calibration or configure full-screen Easter egg triggers & audio",
    keywords: ["cursor", "pointer", "hotspot", "cur", "jumpscare", "prank", "easter egg", "audio", "sound", "fx"],
  },
  {
    id: "rec-brand-portal",
    section: "security",
    title: "Trusted Devices & Hardware Identity",
    description: "Manage registered browsers, hardware telemetry & ECDSA key fingerprints",
    keywords: ["portal", "device", "trust", "register", "orb", "ldv", "secret", "hardware", "gpu", "fingerprint", "revoke"],
    popular: true,
  },
  {
    id: "rec-passkeys-2fa",
    section: "security",
    title: "Hardware Passkeys (WebAuthn) & Authenticator 2FA",
    description: "Link Windows Hello/Touch ID biometric passkeys or activate offline TOTP 6-digit codes",
    keywords: ["passkey", "webauthn", "biometrics", "windows hello", "touch id", "face id", "2fa", "totp", "authenticator", "otp"],
    popular: true,
  },
  {
    id: "rec-qr-pairing",
    section: "security",
    title: "Pair Mobile Device via QR + 6-Digit Code",
    description: "Scan QR code on phone with 6-digit PIN & desktop approval",
    keywords: ["qr", "mobile", "phone", "pair", "6-digit", "pin", "scan", "code"],
    popular: true,
  },
  {
    id: "rec-stealth-gate",
    section: "security",
    title: "Stealth Gate (/admin 404 Protection)",
    description: "Block unregistered browsers at /admin & manage recovery link",
    keywords: ["stealth", "404", "block", "hide", "url", "robots", "admin", "recovery"],
  },
  {
    id: "rec-cookies-logout",
    section: "security",
    title: "Session Epoch, Sign Out All & Audit Log",
    description: "Rotate sessions across devices or review login & device telemetry",
    keywords: ["sign out", "logout", "cookie", "session", "epoch", "audit", "log", "hmac", "security"],
  },
  {
    id: "rec-json-export-restore",
    section: "database",
    title: "JSON Backup, Vault Checkpoints & Selective Restore",
    description:
      "Create rolling server snapshots, export SHA-256 archives or restore selected sections",
    keywords: [
      "backup",
      "export",
      "import",
      "restore",
      "json",
      "snapshot",
      "checkpoint",
      "vault",
      "sha256",
      "download",
    ],
    popular: true,
  },
  {
    id: "rec-db-telemetry",
    section: "database",
    title: "Database Health Probe & Storage Footprint",
    description:
      "Inspect live Supabase probe latency, failover posture & per-section byte size",
    keywords: [
      "database",
      "supabase",
      "storage",
      "health",
      "latency",
      "footprint",
      "inventory",
      "records",
      "telemetry",
    ],
  },
  {
    id: "rec-pwa-cache",
    section: "pwa",
    title: "Service Worker Tiers, Quota & Offline Sync",
    description:
      "Pre-warm portfolio assets, inspect cached URLs, manage outbox or reset cache",
    keywords: [
      "cache",
      "offline",
      "pwa",
      "service worker",
      "outbox",
      "quota",
      "prewarm",
      "sync",
      "clear",
    ],
    popular: true,
  },
  {
    id: "rec-pwa-install",
    section: "pwa",
    title: "Install App Posture & Check SW Updates",
    description:
      "Verify standalone display mode, check service worker updates or install app",
    keywords: ["install", "app", "update", "reload", "manifest", "pwa", "standalone"],
  },
  {
    id: "rec-clear-analytics",
    section: "maintenance",
    title: "Analytics Retention & Read Inbox Purge",
    description:
      "Prune telemetry older than 30/90 days or clear read non-starred messages",
    keywords: [
      "analytics",
      "retention",
      "clear",
      "telemetry",
      "logs",
      "purge",
      "inbox",
      "messages",
      "events",
    ],
  },
  {
    id: "rec-maintenance-media",
    section: "maintenance",
    title: "Orphaned Upload Asset Scanner",
    description:
      "Scan local uploads or Supabase Storage for unreferenced media files",
    keywords: ["orphan", "media", "uploads", "storage", "cleanup", "scan", "images"],
  },
  {
    id: "rec-flush-server",
    section: "maintenance",
    title: "Flush Server Cache & Revalidate ISR",
    description:
      "Clear server memory cache and revalidate public & admin Next.js routes",
    keywords: ["flush", "server", "cache", "isr", "revalidate", "refresh"],
  },
  {
    id: "rec-factory-reset",
    section: "maintenance",
    title: "Factory Reset Seed Defaults",
    description:
      "Auto-snapshots first, then restores baseline Hero, Story, Skills & Projects",
    keywords: ["reset", "seed", "factory", "defaults", "danger", "restore"],
    popular: true,
  },
];

