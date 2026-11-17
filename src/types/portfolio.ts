export type ImageAspectPreset = "1:1" | "3:4" | "4:3" | "16:9" | "original";

export interface ImageTransform {
  zoom: number;
  offsetXPercent: number;
  offsetYPercent: number;
  rotation: number;
  fit: "cover" | "contain";
  aspect: ImageAspectPreset;
  clipCircle: boolean;
}

export interface PsgcAddress {
  regionCode: string;
  regionName: string;
  provinceCode?: string;
  provinceName?: string;
  cityCode: string;
  cityName: string;
  barangayCode?: string;
  barangayName?: string;
}

export interface Profile {
  name: string;
  lastName: string;
  middleName: string;
  fullName: string;
  monogram: string;
  monogramImageUrl?: string;
  monogramTransform?: ImageTransform;
  birthDate: string;
  age: number;
  avatarUrl: string;
  avatarTransform?: ImageTransform;
  resumeUrl: string;
  education: {
    degree: string;
    major: string;
    graduationYear: number;
    status: string;
  };
  headline: string;
  roles: string[];
  bio: string;
  heroCtaPrimary: string;
  heroCtaSecondary: string;
  heroScrollCue: string;
  storyHeading: string;
  storyBody: string[];
  contact: {
    email: string;
    github: string;
    linkedin: string;
    location: string;
    address?: PsgcAddress;
    status: string;
  };
}

export interface SectionHeaders {
  storyEyebrow: string;
  skillsEyebrow: string;
  skillsHeading: string;
  skillsSubtitle: string;
  projectsEyebrow: string;
  projectsHeading: string;
  projectsCounterLabel: string;
  impactEyebrow: string;
  impactHeading: string;
  contactEyebrow: string;
  contactHeading: string;
  contactSubtitle: string;
  contactFormTitle: string;
  contactFormSubtitle: string;
  footerTagline: string;
}

export interface Project {
  id: string;
  title: string;
  category: "Full-Stack System" | "Business Analytics" | "Web Application" | string;
  year: string;
  role: string;
  outcome: string;
  description: string;
  problem: string;
  solution: string;
  stack: string[];
  image: string;
  metrics: string;
  githubUrl?: string;
  liveUrl?: string;
  featured: boolean;
  published?: boolean;
}

export interface SkillItem {
  name: string;
  level: string;
  highlight?: boolean;
}

export interface SkillCategory {
  id: string;
  title: string;
  eyebrow: string;
  description: string;
  skills: SkillItem[];
}

export interface Pillar {
  number: string;
  title: string;
  description: string;
}

export interface Metric {
  value: string;
  prefix?: string;
  suffix?: string;
  label: string;
  description: string;
}

export type EmailDispatchStatus = "sent" | "skipped" | "failed";

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  isRead: boolean;
  isStarred: boolean;
  emailDispatchStatus?: EmailDispatchStatus;
  repliedAt?: string | null;
  replyCount?: number;
  lastReplySubject?: string | null;
  createdAt: string;
}

export type AnalyticsDeviceType = "desktop" | "tablet" | "mobile";

export interface AnalyticsEvent {
  id: string;
  type: "page_view" | "chapter_view" | "project_click" | "contact_click" | "cv_download";
  target: string;
  createdAt: string;
  sessionId?: string;
  device?: AnalyticsDeviceType;
  referrer?: string;
}

export type PortfolioTheme = "dark" | "light";

export type PortfolioThemeMode = "dark" | "light" | "system";

export type AccentPresetId =
  | "vermilion"
  | "ember"
  | "cobalt"
  | "emerald"
  | "violet"
  | "crimson"
  | "custom";

export type FontPairingId = "editorial" | "geometric" | "monolith";

export type DisplayScaleMode = "compact" | "standard" | "large";

export type SurfaceRadiusMode = "sharp" | "balanced" | "soft";

export type CanvasTextureMode = "clean" | "grid" | "dots";

export type NavbarStyleMode = "glass" | "solid";

export type MotionPreferenceMode = "system" | "full" | "reduced";

export type PreloaderMode = "always" | "once-per-session" | "off";

export type MarqueeSpeedMode = "slow" | "normal" | "fast";

export type ImageColorMode = "grayscale-hover" | "always-color";

export type ProjectsLayoutMode = "staggered" | "aligned";

export interface AppearanceConfig {
  defaultTheme: PortfolioThemeMode;
  accentPreset: AccentPresetId;
  customAccentHex: string;
  fontPairing: FontPairingId;
  displayScale: DisplayScaleMode;
  surfaceRadius: SurfaceRadiusMode;
  canvasTexture: CanvasTextureMode;
  navbarStyle: NavbarStyleMode;
  motionMode: MotionPreferenceMode;
  smoothScroll: boolean;
  preloaderMode: PreloaderMode;
  marqueeSpeed: MarqueeSpeedMode;
  magneticCursor: boolean;
  liquidDistortion: boolean;
  imageColorMode: ImageColorMode;
  heroRimGlow: boolean;
  projectsLayout: ProjectsLayoutMode;
}

export interface PortfolioDatabase {
  profile: Profile;
  sectionHeaders: SectionHeaders;
  marqueePrinciples: string[];
  pillars: Pillar[];
  skills: SkillCategory[];
  projects: Project[];
  impactMetrics: Metric[];
  appearance: AppearanceConfig;
  messages: ContactMessage[];
  analytics: AnalyticsEvent[];
  updatedAt: string;
}

export interface PublicPortfolioData {
  profile: Profile;
  sectionHeaders: SectionHeaders;
  marqueePrinciples: string[];
  pillars: Pillar[];
  skills: SkillCategory[];
  projects: Project[];
  impactMetrics: Metric[];
  appearance?: AppearanceConfig;
  updatedAt?: string;
}
