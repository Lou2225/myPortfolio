import type { PortfolioDatabase } from "@/types/portfolio";
import { SECTION_HEADER_FIELD_RULES } from "@/lib/validation";
import {
  SETTINGS_GROUP_LABELS,
  SETTINGS_RECOMMENDATIONS,
  SETTINGS_SECTIONS_META,
} from "@/components/admin/settings/types";
import { shouldReduceMotion } from "@/lib/appearance";
import { AdminTab, SettingsSectionId, getAdminNavItems } from "./types";

export type GlobalSearchIconKey =
  | "overview"
  | "profile"
  | "story"
  | "skills"
  | "projects"
  | "inbox"
  | "settings"
  | "password"
  | "security"
  | "appearance"
  | "database"
  | "pwa"
  | "maintenance"
  | "field"
  | "suggestion";

export interface GlobalSearchFocusTarget {
  selector?: string;
  fieldLabel?: string;
}

export interface GlobalSearchAction {
  kind: "tab" | "settings";
  tab: AdminTab;
  settingsSection?: Exclude<SettingsSectionId, "hub">;
  focusTarget?: GlobalSearchFocusTarget;
}

export interface GlobalSearchEntry {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  badgeVariant: "neutral" | "accent" | "success" | "warning" | "solid";
  iconKey: GlobalSearchIconKey;
  keywords: string;
  popular?: boolean;
  priority: number;
  action: GlobalSearchAction;
}

interface StaticFieldSpec {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  tab: AdminTab;
  settingsSection?: Exclude<SettingsSectionId, "hub">;
  selector?: string;
  fieldLabel?: string;
  keywords: string;
  popular?: boolean;
}

const STATIC_FIELD_AND_FEATURE_SPECS: readonly StaticFieldSpec[] = [
  // Profile & Hero Fields
  {
    id: "field-profile-first-name",
    title: "First / Given Name",
    subtitle: "Hero layer background giant kinetic typography (Profile & Hero)",
    badge: "Profile Field",
    tab: "profile",
    fieldLabel: "First / Given Name",
    keywords: "first name given name lou hero typography identity",
  },
  {
    id: "field-profile-middle-name",
    title: "Middle Name",
    subtitle: "Middle name displayed across legal metadata & schema",
    badge: "Profile Field",
    tab: "profile",
    fieldLabel: "Middle Name",
    keywords: "middle name lava legal full name",
  },
  {
    id: "field-profile-surname",
    title: "Surname (Red Hero)",
    subtitle: "Accent surname kinetic background display layer",
    badge: "Profile Field",
    tab: "profile",
    fieldLabel: "Surname (Red Hero)",
    keywords: "last name surname valdellon accent hero",
  },
  {
    id: "field-profile-fullname",
    title: "Full Legal Name",
    subtitle: "Displayed in OpenGraph, SEO JSON-LD & copyright signatures",
    badge: "Profile Field",
    tab: "profile",
    fieldLabel: "Full Legal Name",
    keywords: "full legal name seo opengraph signature author",
  },
  {
    id: "field-profile-monogram-text",
    title: "Monogram Fallback",
    subtitle: "2-3 letter monogram badge (LV) used when no custom logo image is set",
    badge: "Profile Field",
    tab: "profile",
    fieldLabel: "Monogram Fallback",
    keywords: "monogram initials badge lv logo",
  },
  {
    id: "field-profile-birth-date",
    title: "Birth Date",
    subtitle: "Automatically computes live age across your narrative copy",
    badge: "Profile Field",
    tab: "profile",
    fieldLabel: "Birth Date",
    keywords: "birth date birthday age date",
  },
  {
    id: "field-profile-headline",
    title: "Primary Headline",
    subtitle: "Hero summary headline & browser tab SEO title",
    badge: "Profile Field",
    tab: "profile",
    fieldLabel: "Primary Headline",
    keywords: "headline role title seo meta title hero",
  },
  {
    id: "field-profile-bio",
    title: "Hero Bio Pitch",
    subtitle: "Primary narrative bio & meta description pitch",
    badge: "Profile Field",
    tab: "profile",
    fieldLabel: "Hero Bio Pitch",
    keywords: "bio pitch summary hero intro description",
    popular: true,
  },
  {
    id: "field-profile-cta",
    title: "Hero CTA Buttons & Scroll Cue",
    subtitle: "Primary CTA Text, Secondary CTA Text & Scroll Cue Label",
    badge: "Profile Field",
    tab: "profile",
    fieldLabel: "Primary CTA Text",
    keywords: "primary cta secondary cta scroll cue button action view projects",
  },
  {
    id: "field-profile-monogram-img",
    title: "Monogram Logo Image (Updates Favicon)",
    subtitle: "Upload & crop custom squircle monogram badge + browser favicon",
    badge: "Media Field",
    tab: "profile",
    fieldLabel: "Monogram Logo Image (Updates Favicon)",
    keywords: "monogram logo favicon upload crop brand squircle",
  },
  {
    id: "field-profile-avatar",
    title: "Portrait Image Path or URL",
    subtitle: "Hero cutout portrait image upload, framing & zoom cropper",
    badge: "Media Field",
    tab: "profile",
    fieldLabel: "Portrait Image Path or URL",
    keywords: "avatar portrait image photo picture upload crop cutout hero",
    popular: true,
  },
  {
    id: "field-profile-resume",
    title: "Resume PDF Path or Drive Link",
    subtitle: "Downloadable CV / Resume PDF asset or external link",
    badge: "Profile Field",
    tab: "profile",
    fieldLabel: "Resume PDF Path or Drive Link",
    keywords: "resume cv pdf download link document",
  },
  {
    id: "field-profile-roles",
    title: "Hero Roles Stack",
    subtitle: "Add New Role Title — Stacked specialization roles on Hero left column",
    badge: "Profile Field",
    tab: "profile",
    fieldLabel: "Add New Role Title",
    keywords: "roles stack title full stack developer business analytics",
  },
  {
    id: "field-profile-education",
    title: "Education & Graduation Year",
    subtitle: "Degree Program, Specialization / Major, Graduation Year & Academic Status",
    badge: "Profile Field",
    tab: "profile",
    fieldLabel: "Degree Program",
    keywords: "education degree program bsit specialization major graduation year academic status",
  },
  {
    id: "field-profile-contact",
    title: "Direct Email, GitHub, LinkedIn & PSGC Location",
    subtitle: "Public contact links, Philippine PSGC address & availability badge",
    badge: "Contact Field",
    tab: "profile",
    fieldLabel: "Direct Email Address",
    keywords: "email github linkedin social links contact location address psgc city availability status",
    popular: true,
  },

  // Story & Marquee Fields
  {
    id: "field-story-eyebrow",
    title: "Story Eyebrow & Main Display Heading",
    subtitle: "Chapter 01 Story eyebrow label & narrative display heading",
    badge: "Story Field",
    tab: "story",
    selector: "#story-eyebrow",
    fieldLabel: "Section Eyebrow Label",
    keywords: "story eyebrow heading narrative chapter 01 origin",
  },
  {
    id: "field-story-heading",
    title: "Story Main Display Heading",
    subtitle: "Primary Chapter 01 editorial display headline",
    badge: "Story Field",
    tab: "story",
    selector: "#story-heading",
    fieldLabel: "Story Main Display Heading",
    keywords: "story display heading headline origin narrative",
  },
  {
    id: "field-story-pillars",
    title: "Four Engineering Pillars",
    subtitle: "Edit pillar number code (01–04), Pillar Title & descriptions",
    badge: "Story Field",
    tab: "story",
    fieldLabel: "Pillar Title",
    keywords: "pillars architecture code pillar title philosophy ownership",
  },
  {
    id: "field-story-marquee",
    title: "Add New Marquee Statement",
    subtitle: "Infinite horizontal ticker statements beneath the Hero",
    badge: "Story Field",
    tab: "story",
    selector: "#story-new-ticker",
    fieldLabel: "Add New Marquee Statement",
    keywords: "marquee ticker statements infinite principles banner",
  },

  // Skills & Impact Fields
  {
    id: "field-skills-layers",
    title: "Tech Stack Layer Categories & Skill Badges",
    subtitle: "Edit Eyebrow Tag, Category Title, Description & Add Skill to Layer",
    badge: "Skills Field",
    tab: "skills",
    fieldLabel: "Category Title",
    keywords: "skills category eyebrow title description add skill layer bento tech stack",
  },
  {
    id: "field-skills-impact",
    title: "Impact KPI Counters (Prefix, Value, Suffix)",
    subtitle: "Animated numeric counters & Metric Title labels in Chapter 04",
    badge: "Metrics Field",
    tab: "skills",
    fieldLabel: "Metric Title",
    keywords: "impact kpi counters metrics prefix value suffix numeric animated",
  },

  // Projects Fields
  {
    id: "field-projects-editor",
    title: "Projects & Case Study Fields",
    subtitle: "Title, Category, Year, Role, Outcome, Preview Image, Problem & Solution",
    badge: "Project Field",
    tab: "projects",
    fieldLabel: "Project Title",
    keywords: "project title category badge year role outcome problem solution case study stack metrics github live preview",
    popular: true,
  },

  // Inbox & Overview Suggestions
  {
    id: "field-inbox-filter",
    title: "Contact Inbox & Message Filtering",
    subtitle: "Filter unread/starred messages, inspect submissions & send replies",
    badge: "Inbox",
    tab: "inbox",
    keywords: "inbox filter unread starred messages reply delete contact submissions",
  },
  {
    id: "field-overview-funnel",
    title: "Scroll Chapter Funnel & Conversion Leaderboard",
    subtitle: "Track page views, chapter retention, project clicks & CV downloads",
    badge: "Analytics",
    tab: "overview",
    keywords: "funnel chapter analytics conversion leaderboard clicks downloads views telemetry",
  },

  // Settings Deep Fields
  {
    id: "field-settings-password-inputs",
    title: "Current, New & Confirm Password Fields",
    subtitle: "Update salted scrypt admin login passkey",
    badge: "Password Field",
    tab: "settings",
    settingsSection: "password",
    selector: "#settings-current-password",
    fieldLabel: "Current Password",
    keywords: "current password new password confirm scrypt passkey",
  },
  {
    id: "field-settings-appearance-hex",
    title: "RGB / Hex Custom Accent Color Picker",
    subtitle: "Enter custom brand accent hex with automatic WCAG AA contrast",
    badge: "Appearance Field",
    tab: "settings",
    settingsSection: "appearance",
    selector: "#appearance-custom-accent-picker",
    fieldLabel: "RGB / Hex Color Selector",
    keywords: "rgb hex color picker swatch brand accent custom wcag contrast theme",
    popular: true,
  },
  {
    id: "field-settings-appearance-type",
    title: "Font Pairings & Public Portfolio Type Scale",
    subtitle: "Switch Editorial/Geometric/Monolith fonts and Compact/Standard/Large scale",
    badge: "Appearance Option",
    tab: "settings",
    settingsSection: "appearance",
    fieldLabel: "Font pairings & display scale scope",
    keywords: "font pairing typography scale compact standard large anton onest space grotesk bebas",
  },
  {
    id: "field-settings-appearance-surfaces",
    title: "Card Radii, Canvas Texture & Navbar Frost",
    subtitle: "Customize surface corner radius, grid/dot texture, aligned/staggered grid",
    badge: "Appearance Option",
    tab: "settings",
    settingsSection: "appearance",
    fieldLabel: "Spatial surface design tokens",
    keywords: "radius corners sharp balanced soft texture clean grid dots navbar glass solid projects layout staggered aligned grayscale color",
  },
  {
    id: "field-settings-security-qr",
    title: "QR Base Origin & Mobile Device Pairing",
    subtitle: "Pair phone via QR + 6-digit PIN or customize LAN IP pairing URL",
    badge: "Security Field",
    tab: "settings",
    settingsSection: "security",
    selector: "#qr-origin-override",
    fieldLabel: "How QR mobile pairing works",
    keywords: "qr origin mobile pair 6 digit otp trusted device hardware webcrypto",
  },
  {
    id: "field-settings-database-checkpoint",
    title: "Checkpoint Label & Snapshot Vault",
    subtitle: "Save named rollback checkpoints & download SHA-256 JSON backups",
    badge: "Backup Field",
    tab: "settings",
    settingsSection: "database",
    selector: "#snapshot-checkpoint-label",
    fieldLabel: "Checkpoint Label",
    keywords: "checkpoint label snapshot vault backup json restore import export sha256",
  },
];

export function buildGlobalSearchEntries(
  db: PortfolioDatabase
): GlobalSearchEntry[] {
  const entries: GlobalSearchEntry[] = [];
  const unreadCount = db.messages.filter((m) => !m.isRead).length;

  // 1. Primary CMS Tabs
  for (const nav of getAdminNavItems({
    projectsCount: db.projects.length,
    unreadMessagesCount: unreadCount,
  })) {
    entries.push({
      id: `tab-${nav.id}`,
      title: nav.label,
      subtitle: nav.description,
      badge: nav.badge ? `${nav.badge}` : "CMS Module",
      badgeVariant: nav.isAlertBadge ? "accent" : "neutral",
      iconKey: nav.id,
      keywords: `${nav.label} ${nav.shortLabel} ${nav.description} module tab`,
      popular:
        nav.id === "overview" || nav.id === "projects" || nav.id === "settings",
      priority: 18,
      action: { kind: "tab", tab: nav.id },
    });
  }

  // 2. Settings Sub-pages
  for (const meta of SETTINGS_SECTIONS_META) {
    entries.push({
      id: `settings-${meta.id}`,
      title: meta.title,
      subtitle: meta.subtitle,
      badge: SETTINGS_GROUP_LABELS[meta.group],
      badgeVariant: "neutral",
      iconKey: meta.id,
      keywords: `${meta.title} ${meta.eyebrow} ${meta.subtitle} ${meta.keywords.join(" ")} settings`,
      popular: meta.id === "appearance" || meta.id === "security",
      priority: 16,
      action: {
        kind: "settings",
        tab: "settings",
        settingsSection: meta.id,
      },
    });
  }

  // 3. Curated Settings Suggestions (exact match to Find a Setting)
  for (const rec of SETTINGS_RECOMMENDATIONS) {
    const parent = SETTINGS_SECTIONS_META.find((s) => s.id === rec.section);
    entries.push({
      id: `rec-${rec.id}`,
      title: rec.title,
      subtitle: rec.description,
      badge: parent?.title || "Setting Suggestion",
      badgeVariant: "neutral",
      iconKey: rec.section,
      keywords: `${rec.title} ${rec.description} ${rec.keywords.join(" ")} suggestion setting`,
      popular: Boolean(rec.popular),
      priority: 15,
      action: {
        kind: "settings",
        tab: "settings",
        settingsSection: rec.section,
      },
    });
  }

  // 4. All Individual CMS Form Fields & Features
  for (const spec of STATIC_FIELD_AND_FEATURE_SPECS) {
    entries.push({
      id: spec.id,
      title: spec.title,
      subtitle: spec.subtitle,
      badge: spec.badge,
      badgeVariant: "neutral",
      iconKey: spec.settingsSection ?? "field",
      keywords: `${spec.title} ${spec.subtitle} ${spec.badge} ${spec.keywords}`,
      popular: Boolean(spec.popular),
      priority: 12,
      action: spec.settingsSection
        ? {
            kind: "settings",
            tab: "settings",
            settingsSection: spec.settingsSection,
            focusTarget: {
              selector: spec.selector,
              fieldLabel: spec.fieldLabel,
            },
          }
        : {
            kind: "tab",
            tab: spec.tab,
            focusTarget: {
              selector: spec.selector,
              fieldLabel: spec.fieldLabel,
            },
          },
    });
  }

  // 5. Global Section Header Fields (dynamically sourced from SECTION_HEADER_FIELD_RULES)
  for (const rule of SECTION_HEADER_FIELD_RULES) {
    entries.push({
      id: `section-header-${rule.key}`,
      title: rule.label,
      subtitle: `Global section copy field (e.g. "${rule.placeholder}")`,
      badge: "Global Copy Field",
      badgeVariant: "neutral",
      iconKey: "field",
      keywords: `${rule.label} ${rule.key} ${rule.placeholder} global copy section heading eyebrow subtitle footer`,
      priority: 11,
      action: {
        kind: "tab",
        tab: "skills",
        focusTarget: {
          selector: `#section-header-${rule.key}`,
          fieldLabel: rule.label,
        },
      },
    });
  }

  // 6. Live Database Records (Projects, Skills, Metrics, Pillars, Messages)
  for (const project of db.projects) {
    entries.push({
      id: `project-${project.id}`,
      title: project.title,
      subtitle: `${project.category} · ${project.year} · ${project.stack.slice(0, 4).join(", ")}`,
      badge:
        project.published === false
          ? "Draft Project"
          : project.featured
            ? "Featured Project"
            : "Project",
      badgeVariant: project.published === false ? "warning" : "accent",
      iconKey: "projects",
      keywords: `${project.title} ${project.category} ${project.year} ${project.role} ${project.description} ${project.metrics} ${project.stack.join(" ")}`,
      priority: 14,
      action: {
        kind: "tab",
        tab: "projects",
      },
    });
  }

  for (const cat of db.skills) {
    const names = cat.skills.map((s) => s.name);
    entries.push({
      id: `skill-cat-${cat.id}`,
      title: cat.title,
      subtitle: `${cat.eyebrow} · ${names.slice(0, 5).join(", ")}`,
      badge: `${cat.skills.length} Skills`,
      badgeVariant: "neutral",
      iconKey: "skills",
      keywords: `${cat.title} ${cat.eyebrow} ${cat.description} ${names.join(" ")}`,
      priority: 10,
      action: {
        kind: "tab",
        tab: "skills",
        focusTarget: { selector: `#cat-${cat.id}-eyebrow` },
      },
    });
  }

  for (const metric of db.impactMetrics) {
    const valueText = `${metric.prefix ?? ""}${metric.value}${metric.suffix ?? ""}`;
    entries.push({
      id: `impact-${metric.label}`,
      title: `${valueText} — ${metric.label}`,
      subtitle: metric.description,
      badge: "Impact KPI",
      badgeVariant: "neutral",
      iconKey: "skills",
      keywords: `${valueText} ${metric.label} ${metric.description} impact metric kpi`,
      priority: 9,
      action: {
        kind: "tab",
        tab: "skills",
        focusTarget: { fieldLabel: "Metric Title" },
      },
    });
  }

  for (const pillar of db.pillars) {
    entries.push({
      id: `pillar-${pillar.number}-${pillar.title}`,
      title: `${pillar.number} · ${pillar.title}`,
      subtitle: pillar.description,
      badge: "Story Pillar",
      badgeVariant: "neutral",
      iconKey: "story",
      keywords: `${pillar.number} ${pillar.title} ${pillar.description} pillar story`,
      priority: 9,
      action: { kind: "tab", tab: "story" },
    });
  }

  for (const msg of db.messages.slice(0, 10)) {
    entries.push({
      id: `msg-${msg.id}`,
      title: msg.subject || `Message from ${msg.name}`,
      subtitle: `${msg.name} (${msg.email}) · ${msg.message}`,
      badge: msg.isRead ? "Inbox Read" : "Unread",
      badgeVariant: msg.isRead ? "neutral" : "accent",
      iconKey: "inbox",
      keywords: `${msg.name} ${msg.email} ${msg.subject} ${msg.message} inbox contact`,
      priority: msg.isRead ? 6 : 11,
      action: { kind: "tab", tab: "inbox" },
    });
  }

  return entries;
}

export function rankGlobalSearchEntries(
  entries: readonly GlobalSearchEntry[],
  query: string
): GlobalSearchEntry[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return entries.filter((e) => e.popular).slice(0, 8);
  }

  const tokens = normalized.split(/\s+/).filter(Boolean);
  const scored: Array<{ entry: GlobalSearchEntry; score: number }> = [];

  for (const entry of entries) {
    const titleLow = entry.title.toLowerCase();
    const subtitleLow = entry.subtitle.toLowerCase();
    const badgeLow = entry.badge.toLowerCase();
    const corpusLow = entry.keywords.toLowerCase();

    const matchesAll = tokens.every(
      (tok) =>
        titleLow.includes(tok) ||
        subtitleLow.includes(tok) ||
        badgeLow.includes(tok) ||
        corpusLow.includes(tok)
    );
    if (!matchesAll) continue;

    let score = entry.priority;
    if (titleLow === normalized) score += 120;
    else if (titleLow.startsWith(normalized)) score += 85;
    else if (titleLow.includes(normalized)) score += 55;
    if (subtitleLow.includes(normalized)) score += 25;
    if (badgeLow.includes(normalized)) score += 15;

    scored.push({ entry, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 14).map((s) => s.entry);
}

/**
 * Smoothly scrolls to and briefly highlights a target input/section after
 * tab or settings sub-page transition completes.
 */
export function focusSearchTargetField(
  focusTarget?: GlobalSearchFocusTarget
): void {
  if (!focusTarget || typeof document === "undefined") return;
  const { selector, fieldLabel } = focusTarget;
  if (!selector && !fieldLabel) return;

  let attempts = 0;
  const maxAttempts = 16;

  const tryLocate = () => {
    attempts += 1;

    let el: HTMLElement | null = null;
    if (selector) {
      el = document.querySelector<HTMLElement>(selector);
    }

    if (!el && fieldLabel) {
      const normalizedNeedle = fieldLabel.trim().toLowerCase();
      const wrappers = document.querySelectorAll<HTMLElement>("[data-field-label]");
      for (const wrapper of wrappers) {
        const attr = (wrapper.getAttribute("data-field-label") || "").toLowerCase();
        if (attr === normalizedNeedle || attr.includes(normalizedNeedle)) {
          el = wrapper;
          break;
        }
      }
      if (!el) {
        const labels = document.querySelectorAll<HTMLLabelElement>("label");
        for (const label of labels) {
          if ((label.textContent || "").toLowerCase().includes(normalizedNeedle)) {
            el = (label.closest("[data-field-label]") as HTMLElement | null) || label;
            break;
          }
        }
      }
    }

    if (!el) {
      if (attempts < maxAttempts) {
        window.setTimeout(tryLocate, 45);
      }
      return;
    }

    el.scrollIntoView({
      behavior: shouldReduceMotion() ? "auto" : "smooth",
      block: "center",
    });

    const inputCandidate = el.matches("input, textarea, select")
      ? el
      : el.querySelector<HTMLElement>("input, textarea, select");

    if (inputCandidate) {
      window.setTimeout(() => {
        inputCandidate.focus({ preventScroll: true });
      }, 180);
    }

    const highlightHost =
      (el.closest("[data-field-label]") as HTMLElement | null) ||
      inputCandidate ||
      el;

    if (!shouldReduceMotion() && typeof highlightHost.animate === "function") {
      highlightHost.animate(
        [
          {
            boxShadow: "0 0 0 0 rgba(255, 59, 29, 0)",
          },
          {
            boxShadow: "0 0 0 3px var(--accent-glow, rgba(255, 59, 29, 0.35))",
          },
          {
            boxShadow: "0 0 0 0 rgba(255, 59, 29, 0)",
          },
        ],
        {
          duration: 1400,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        }
      );
    }
  };

  window.setTimeout(tryLocate, 60);
}
