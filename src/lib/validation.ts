import { z } from "zod";
import {
  Metric,
  Pillar,
  Profile,
  Project,
  PsgcAddress,
  SectionHeaders,
  SkillCategory,
} from "@/types/portfolio";
import {
  ValidationResult,
  validateBirthDate,
  validateEmail,
  validateMessage,
  validateName,
  validateNumber,
  validateSubject,
  validateUrl,
} from "@/lib/inputValidation";

export * from "@/lib/inputValidation";

export const passwordChangeSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, "Current password is required.")
      .max(128, "Current password is too long."),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters.")
      .max(128, "New password cannot exceed 128 characters.")
      .refine((v) => !/\s/.test(v), "New password cannot contain spaces.")
      .refine(
        (v) => /[A-Za-z]/.test(v) && /[^A-Za-z\s]/.test(v),
        "Include at least one letter and one number or symbol."
      ),
    confirmPassword: z.string().min(1, "Please confirm your new password."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Confirmation password does not match the new password.",
    path: ["confirmPassword"],
  });

/**
 * Shared Zod Schema for Contact API & Client Form
 */
export const contactFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters.")
    .max(80, "Name cannot exceed 80 characters.")
    .refine((val) => validateName(val).valid, {
      message: "Please enter a valid name (letters only).",
    }),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine((val) => validateEmail(val).valid, {
      message: "Please enter a valid email address.",
    }),
  subject: z
    .string()
    .trim()
    .min(3, "Subject must be at least 3 characters.")
    .max(120, "Subject cannot exceed 120 characters.")
    .refine((val) => validateSubject(val).valid, {
      message: "Please enter a clear subject line.",
    }),
  message: z
    .string()
    .trim()
    .min(10, "Message must be at least 10 characters.")
    .max(2000, "Message cannot exceed 2000 characters.")
    .refine((val) => validateMessage(val).valid, {
      message: "Please provide a clear, descriptive message.",
    }),
});

export type ContactFormValues = z.infer<typeof contactFormSchema>;

/**
 * Zod schema for replying to a contact inquiry directly from /admin Inbox.
 */
export const contactReplySchema = z.object({
  id: z.string().trim().min(1, "Message ID is required.").max(120),
  subject: z
    .string()
    .trim()
    .min(3, "Reply subject must be at least 3 characters.")
    .max(160, "Reply subject cannot exceed 160 characters."),
  replyBody: z
    .string()
    .trim()
    .min(5, "Reply message must be at least 5 characters.")
    .max(5000, "Reply message cannot exceed 5000 characters."),
});

export type ContactReplyValues = z.infer<typeof contactReplySchema>;

function validatePsgcAddress(
  address?: PsgcAddress,
  options?: { requiresProvince?: boolean }
): ValidationResult {
  if (!address || (!address.regionCode && !address.cityCode)) {
    return { valid: true };
  }
  if (!address.regionCode) {
    return { valid: false, error: "Please select a PSGC Region." };
  }
  if (options?.requiresProvince && !address.provinceCode) {
    return { valid: false, error: "Please select a PSGC Province." };
  }
  if (!address.cityCode) {
    return { valid: false, error: "Please select a City / Municipality." };
  }
  return { valid: true };
}

export function validateProfileDraft(
  profile: Profile,
  options?: { requiresProvince?: boolean }
): { valid: boolean; errors: string[] } {
  const checks: ValidationResult[] = [
    validateName(profile.name, {
      label: "First / Given Name",
      minLength: 2,
      maxLength: 40,
      required: true,
    }),
    validateName(profile.lastName, {
      label: "Surname",
      minLength: 2,
      maxLength: 40,
      required: true,
    }),
    validateName(profile.middleName || "", {
      label: "Middle Name",
      minLength: 1,
      maxLength: 40,
      required: false,
    }),
    validateName(profile.fullName, {
      label: "Full Legal Name",
      minLength: 4,
      maxLength: 80,
      required: true,
    }),
    validateSubject(profile.monogram, {
      label: "Monogram Badge",
      minLength: 2,
      maxLength: 5,
      required: true,
    }),
    validateUrl(profile.monogramImageUrl || "", {
      label: "Monogram / Favicon Image",
      required: false,
      allowRelativePath: true,
    }),
    validateBirthDate(profile.birthDate, {
      label: "Birth Date",
      minAge: 15,
      maxAge: 100,
      required: true,
    }),
    validateSubject(profile.headline, {
      label: "Primary Headline",
      minLength: 4,
      maxLength: 120,
      required: true,
    }),
    validateMessage(profile.bio, {
      label: "Hero Bio Pitch",
      minLength: 20,
      maxLength: 420,
      required: true,
    }),
    validateSubject(profile.heroCtaPrimary, {
      label: "Primary CTA Text",
      minLength: 2,
      maxLength: 32,
      required: true,
    }),
    validateSubject(profile.heroCtaSecondary, {
      label: "Secondary CTA Text",
      minLength: 2,
      maxLength: 32,
      required: true,
    }),
    validateSubject(profile.heroScrollCue, {
      label: "Bottom Scroll Cue Label",
      minLength: 3,
      maxLength: 60,
      required: true,
    }),
    validateUrl(profile.avatarUrl, {
      label: "Portrait Image",
      required: true,
      allowRelativePath: true,
    }),
    validateUrl(profile.resumeUrl || "", {
      label: "Resume PDF",
      required: false,
      allowRelativePath: true,
    }),
    validateSubject(profile.education.degree, {
      label: "Degree Program",
      minLength: 3,
      maxLength: 100,
      required: true,
    }),
    validateSubject(profile.education.major, {
      label: "Specialization / Major",
      minLength: 2,
      maxLength: 80,
      required: true,
    }),
    validateNumber(profile.education.graduationYear, {
      label: "Graduation Year",
      min: 2000,
      max: 2035,
      required: true,
    }),
    validateSubject(profile.education.status, {
      label: "Academic Status Label",
      minLength: 3,
      maxLength: 80,
      required: true,
    }),
    validateEmail(profile.contact.email, {
      label: "Direct Email Address",
      required: true,
    }),
    validateUrl(profile.contact.github, {
      label: "GitHub Profile URL",
      required: true,
      allowRelativePath: false,
    }),
    validateUrl(profile.contact.linkedin, {
      label: "LinkedIn Profile URL",
      required: true,
      allowRelativePath: false,
    }),
    validatePsgcAddress(profile.contact.address, options),
    validateSubject(profile.contact.location, {
      label: "Location",
      minLength: 2,
      maxLength: 160,
      required: true,
    }),
    validateSubject(profile.contact.status, {
      label: "Availability Status Badge",
      minLength: 3,
      maxLength: 80,
      required: true,
    }),
  ];

  const errors: string[] = [];
  for (const check of checks) {
    if (!check.valid && check.error) {
      errors.push(check.error);
    }
  }

  if (!Array.isArray(profile.roles) || profile.roles.length === 0) {
    errors.push("At least one Hero Role Title is required.");
  } else {
    const seen = new Set<string>();
    profile.roles.forEach((role, idx) => {
      const check = validateSubject(role, {
        label: `Hero Role #${idx + 1}`,
        minLength: 2,
        maxLength: 60,
        required: true,
      });
      if (!check.valid && check.error) {
        errors.push(check.error);
      }
      const norm = role.trim().toLowerCase();
      if (norm && seen.has(norm)) {
        errors.push(`Hero Role "${role.trim()}" is duplicated.`);
      }
      if (norm) seen.add(norm);
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export interface StoryDraftInput {
  storyEyebrow: string;
  storyHeading: string;
  storyBody: string[];
  pillars: Pillar[];
  marqueePrinciples: string[];
}

export function validateStoryDraft(draft: StoryDraftInput): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  const eyebrowCheck = validateSubject(draft.storyEyebrow, {
    label: "Section Eyebrow Label",
    minLength: 3,
    maxLength: 80,
    required: true,
  });
  if (!eyebrowCheck.valid && eyebrowCheck.error) {
    errors.push(eyebrowCheck.error);
  }

  const headingCheck = validateSubject(draft.storyHeading, {
    label: "Story Main Display Heading",
    minLength: 6,
    maxLength: 120,
    required: true,
  });
  if (!headingCheck.valid && headingCheck.error) {
    errors.push(headingCheck.error);
  }

  if (!Array.isArray(draft.storyBody) || draft.storyBody.length === 0) {
    errors.push("At least one Origin Narrative paragraph is required.");
  } else {
    draft.storyBody.forEach((paragraph, idx) => {
      const check = validateMessage(paragraph, {
        label: `Paragraph ${String(idx + 1).padStart(2, "0")}`,
        minLength: 20,
        maxLength: 900,
        required: true,
      });
      if (!check.valid && check.error) {
        errors.push(check.error);
      }
    });
  }

  if (!Array.isArray(draft.pillars) || draft.pillars.length === 0) {
    errors.push("At least one Core Pillar card is required.");
  } else {
    const seenCodes = new Set<string>();
    const seenTitles = new Set<string>();

    draft.pillars.forEach((pillar, idx) => {
      const code = pillar.number.trim();
      const codeCheck = validateSubject(code, {
        label: `Pillar #${idx + 1} Code`,
        minLength: 2,
        maxLength: 4,
        required: true,
      });
      if (!codeCheck.valid && codeCheck.error) {
        errors.push(codeCheck.error);
      } else {
        const normCode = code.toLowerCase();
        if (normCode && seenCodes.has(normCode)) {
          errors.push(`Pillar code "${code}" is duplicated.`);
        }
        if (normCode) seenCodes.add(normCode);
      }

      const titleCheck = validateSubject(pillar.title, {
        label: `Pillar #${idx + 1} Title`,
        minLength: 3,
        maxLength: 80,
        required: true,
      });
      if (!titleCheck.valid && titleCheck.error) {
        errors.push(titleCheck.error);
      } else {
        const normTitle = pillar.title.trim().toLowerCase();
        if (normTitle && seenTitles.has(normTitle)) {
          errors.push(`Pillar title "${pillar.title.trim()}" is duplicated.`);
        }
        if (normTitle) seenTitles.add(normTitle);
      }

      const descCheck = validateMessage(pillar.description, {
        label: `Pillar #${idx + 1} Description`,
        minLength: 15,
        maxLength: 360,
        required: true,
      });
      if (!descCheck.valid && descCheck.error) {
        errors.push(descCheck.error);
      }
    });
  }

  if (
    !Array.isArray(draft.marqueePrinciples) ||
    draft.marqueePrinciples.length === 0
  ) {
    errors.push("At least one Infinite Marquee statement is required.");
  } else {
    const seenStatements = new Set<string>();
    draft.marqueePrinciples.forEach((statement, idx) => {
      const check = validateSubject(statement, {
        label: `Statement ${String(idx + 1).padStart(2, "0")}`,
        minLength: 3,
        maxLength: 60,
        required: true,
      });
      if (!check.valid && check.error) {
        errors.push(check.error);
      } else {
        const norm = statement.trim().toLowerCase();
        if (norm && seenStatements.has(norm)) {
          errors.push(`Marquee statement "${statement.trim()}" is duplicated.`);
        }
        if (norm) seenStatements.add(norm);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateSkillName(
  value: string,
  label = "Skill Name"
): ValidationResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return { valid: false, error: `${label} is required.` };
  }
  if (trimmed.length > 60) {
    return { valid: false, error: `${label} must be 60 characters or fewer.` };
  }
  if (!/[\p{L}\p{N}]/u.test(trimmed)) {
    return {
      valid: false,
      error: `${label} must include at least one letter or number.`,
    };
  }
  return { valid: true };
}

export function validateMetricValue(
  value: string,
  label = "Metric Value"
): ValidationResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return { valid: false, error: `${label} is required.` };
  }
  if (trimmed.length > 12) {
    return { valid: false, error: `${label} must be 12 characters or fewer.` };
  }
  if (!/\d/.test(trimmed) || !/^[\d.,\-–\s]+$/.test(trimmed)) {
    return {
      valid: false,
      error: `${label} must be a number or range (e.g. 100 or 60-120).`,
    };
  }
  return { valid: true };
}

export function validateMetricAffix(
  value: string,
  label = "Affix"
): ValidationResult {
  if (!value.trim()) {
    return { valid: true };
  }
  if (value.length > 12) {
    return { valid: false, error: `${label} must be 12 characters or fewer.` };
  }
  return { valid: true };
}

export interface SectionHeaderFieldRule {
  key: keyof SectionHeaders;
  label: string;
  minLength: number;
  maxLength: number;
  placeholder: string;
  mono?: boolean;
}

export const SECTION_HEADER_FIELD_RULES: readonly SectionHeaderFieldRule[] = [
  {
    key: "skillsEyebrow",
    label: "Skills Section Eyebrow",
    minLength: 3,
    maxLength: 60,
    placeholder: "CH // 02 · Full-Stack Capabilities",
    mono: true,
  },
  {
    key: "skillsHeading",
    label: "Skills Main Heading",
    minLength: 4,
    maxLength: 100,
    placeholder: "THE FOUR SYSTEM LAYERS.",
  },
  {
    key: "skillsSubtitle",
    label: "Skills Subtitle",
    minLength: 10,
    maxLength: 220,
    placeholder: "Bridging database infrastructure with modern engineering...",
  },
  {
    key: "projectsEyebrow",
    label: "Projects Section Eyebrow",
    minLength: 3,
    maxLength: 60,
    placeholder: "CH // 03 · Selected Work",
    mono: true,
  },
  {
    key: "projectsHeading",
    label: "Projects Main Heading",
    minLength: 4,
    maxLength: 100,
    placeholder: "SYSTEMS ENGINEERED END-TO-END.",
  },
  {
    key: "projectsCounterLabel",
    label: "Projects Counter Label",
    minLength: 3,
    maxLength: 40,
    placeholder: "Featured Systems",
  },
  {
    key: "impactEyebrow",
    label: "Impact Section Eyebrow",
    minLength: 3,
    maxLength: 60,
    placeholder: "CH // 04 · By The Numbers",
    mono: true,
  },
  {
    key: "impactHeading",
    label: "Impact Main Heading",
    minLength: 4,
    maxLength: 100,
    placeholder: "MEASURED COMMITMENT.",
  },
  {
    key: "contactEyebrow",
    label: "Contact Section Eyebrow",
    minLength: 3,
    maxLength: 60,
    placeholder: "CH // 05 · Initiate Collaboration",
    mono: true,
  },
  {
    key: "contactHeading",
    label: "Contact Main Heading",
    minLength: 6,
    maxLength: 120,
    placeholder: "HAVE A SYSTEM TO BUILD OR A TEAM TO GROW?",
  },
  {
    key: "contactSubtitle",
    label: "Contact Subtitle",
    minLength: 15,
    maxLength: 320,
    placeholder: "Graduating BSIT Business Analytics major seeking roles...",
  },
  {
    key: "footerTagline",
    label: "Footer Tagline",
    minLength: 6,
    maxLength: 100,
    placeholder: "Full-Stack Developer · BSIT Business Analytics",
  },
] as const;

export interface SkillsImpactDraftInput {
  skills: SkillCategory[];
  impactMetrics: Metric[];
  sectionHeaders: SectionHeaders;
}

export function validateSkillsImpactDraft(draft: SkillsImpactDraftInput): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!Array.isArray(draft.skills) || draft.skills.length === 0) {
    errors.push("At least one Skills Bento category is required.");
  } else {
    const seenCategories = new Set<string>();

    draft.skills.forEach((category, catIdx) => {
      const catLabel = category.title.trim() || `Category #${catIdx + 1}`;

      const eyebrowCheck = validateSubject(category.eyebrow, {
        label: `${catLabel} Eyebrow Tag`,
        minLength: 3,
        maxLength: 50,
        required: true,
      });
      if (!eyebrowCheck.valid && eyebrowCheck.error) {
        errors.push(eyebrowCheck.error);
      }

      const titleCheck = validateSubject(category.title, {
        label: `Category #${catIdx + 1} Title`,
        minLength: 3,
        maxLength: 60,
        required: true,
      });
      if (!titleCheck.valid && titleCheck.error) {
        errors.push(titleCheck.error);
      } else {
        const normTitle = category.title.trim().toLowerCase();
        if (normTitle && seenCategories.has(normTitle)) {
          errors.push(`Category title "${category.title.trim()}" is duplicated.`);
        }
        if (normTitle) seenCategories.add(normTitle);
      }

      const descCheck = validateMessage(category.description, {
        label: `${catLabel} Description`,
        minLength: 10,
        maxLength: 240,
        required: true,
      });
      if (!descCheck.valid && descCheck.error) {
        errors.push(descCheck.error);
      }

      if (!Array.isArray(category.skills) || category.skills.length === 0) {
        errors.push(`"${catLabel}" requires at least one skill entry.`);
      } else {
        const seenSkills = new Set<string>();
        category.skills.forEach((skill, skillIdx) => {
          const skillCheck = validateSkillName(
            skill.name,
            `${catLabel} · Skill ${String(skillIdx + 1).padStart(2, "0")}`
          );
          if (!skillCheck.valid && skillCheck.error) {
            errors.push(skillCheck.error);
          } else {
            const normSkill = skill.name.trim().toLowerCase();
            if (normSkill && seenSkills.has(normSkill)) {
              errors.push(
                `Skill "${skill.name.trim()}" is duplicated in "${catLabel}".`
              );
            }
            if (normSkill) seenSkills.add(normSkill);
          }
        });
      }
    });
  }

  if (!Array.isArray(draft.impactMetrics) || draft.impactMetrics.length === 0) {
    errors.push("At least one Impact Metric counter is required.");
  } else {
    const seenMetrics = new Set<string>();

    draft.impactMetrics.forEach((metric, idx) => {
      const prefixCheck = validateMetricAffix(
        metric.prefix || "",
        `Counter #${idx + 1} Prefix`
      );
      if (!prefixCheck.valid && prefixCheck.error) {
        errors.push(prefixCheck.error);
      }

      const valueCheck = validateMetricValue(
        metric.value,
        `Counter #${idx + 1} Value`
      );
      if (!valueCheck.valid && valueCheck.error) {
        errors.push(valueCheck.error);
      }

      const suffixCheck = validateMetricAffix(
        metric.suffix || "",
        `Counter #${idx + 1} Suffix`
      );
      if (!suffixCheck.valid && suffixCheck.error) {
        errors.push(suffixCheck.error);
      }

      const labelCheck = validateSubject(metric.label, {
        label: `Counter #${idx + 1} Title`,
        minLength: 3,
        maxLength: 60,
        required: true,
      });
      if (!labelCheck.valid && labelCheck.error) {
        errors.push(labelCheck.error);
      } else {
        const normLabel = metric.label.trim().toLowerCase();
        if (normLabel && seenMetrics.has(normLabel)) {
          errors.push(`Metric title "${metric.label.trim()}" is duplicated.`);
        }
        if (normLabel) seenMetrics.add(normLabel);
      }

      const descCheck = validateMessage(metric.description, {
        label: `Counter #${idx + 1} Description`,
        minLength: 10,
        maxLength: 220,
        required: true,
      });
      if (!descCheck.valid && descCheck.error) {
        errors.push(descCheck.error);
      }
    });
  }

  for (const rule of SECTION_HEADER_FIELD_RULES) {
    const check = validateSubject(draft.sectionHeaders[rule.key] || "", {
      label: rule.label,
      minLength: rule.minLength,
      maxLength: rule.maxLength,
      required: true,
    });
    if (!check.valid && check.error) {
      errors.push(check.error);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateProjectYear(
  value: string,
  label = "Year"
): ValidationResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return { valid: false, error: `${label} is required.` };
  }
  if (trimmed.length < 2 || trimmed.length > 20) {
    return {
      valid: false,
      error: `${label} must be between 2 and 20 characters.`,
    };
  }
  if (!/\d{2}/.test(trimmed) || !/^[\p{L}\p{N}\s\-–/]+$/u.test(trimmed)) {
    return {
      valid: false,
      error: `${label} must include a valid year or range (e.g. 2026 or 2025–2026).`,
    };
  }
  return { valid: true };
}

function validateProjectItem(
  project: Project,
  index: number,
  options?: {
    hasPendingImage?: boolean;
  }
): string[] {
  const errors: string[] = [];
  const prefix = `Project #${index + 1}`;

  const textChecks: ValidationResult[] = [
    validateSubject(project.title, {
      label: `${prefix} Title`,
      minLength: 3,
      maxLength: 100,
      required: true,
    }),
    validateSubject(project.category, {
      label: `${prefix} Category`,
      minLength: 2,
      maxLength: 50,
      required: true,
    }),
    validateProjectYear(project.year, `${prefix} Year`),
    validateSubject(project.role, {
      label: `${prefix} Role`,
      minLength: 3,
      maxLength: 90,
      required: true,
    }),
    validateSubject(project.outcome, {
      label: `${prefix} Outcome`,
      minLength: 3,
      maxLength: 90,
      required: true,
    }),
    validateSubject(project.metrics, {
      label: `${prefix} Metrics Banner`,
      minLength: 5,
      maxLength: 140,
      required: true,
    }),
    validateMessage(project.description, {
      label: `${prefix} Summary`,
      minLength: 15,
      maxLength: 500,
      required: true,
    }),
    validateMessage(project.problem, {
      label: `${prefix} Problem`,
      minLength: 15,
      maxLength: 400,
      required: true,
    }),
    validateMessage(project.solution, {
      label: `${prefix} Solution`,
      minLength: 15,
      maxLength: 400,
      required: true,
    }),
    validateUrl(project.githubUrl || "", {
      label: `${prefix} GitHub Repository URL`,
      required: false,
      allowRelativePath: false,
    }),
    validateUrl(project.liveUrl || "", {
      label: `${prefix} Live Demo URL`,
      required: false,
      allowRelativePath: false,
    }),
  ];

  if (!options?.hasPendingImage) {
    textChecks.push(
      validateUrl(project.image || "", {
        label: `${prefix} Preview Image`,
        required: true,
        allowRelativePath: true,
      })
    );
  }

  for (const check of textChecks) {
    if (!check.valid && check.error) {
      errors.push(check.error);
    }
  }

  if (!Array.isArray(project.stack) || project.stack.length === 0) {
    errors.push(`${prefix} requires at least one tech stack badge.`);
  } else {
    const seenTech = new Set<string>();
    project.stack.forEach((tech, techIdx) => {
      const techCheck = validateSkillName(
        tech,
        `${prefix} · Tech Badge #${techIdx + 1}`
      );
      if (!techCheck.valid && techCheck.error) {
        errors.push(techCheck.error);
      } else {
        const norm = tech.trim().toLowerCase();
        if (norm && seenTech.has(norm)) {
          errors.push(
            `Tech badge "${tech.trim()}" is duplicated in ${prefix}.`
          );
        }
        if (norm) seenTech.add(norm);
      }
    });
  }

  return errors;
}

export function validateProjectsDraft(
  projects: Project[],
  pendingImageIds?: ReadonlySet<string>
): {
  valid: boolean;
  errors: string[];
  errorsByProject: Record<string, string[]>;
} {
  const errors: string[] = [];
  const errorsByProject: Record<string, string[]> = {};

  if (!Array.isArray(projects) || projects.length === 0) {
    errors.push("At least one project case study is required.");
    return { valid: false, errors, errorsByProject };
  }

  const seenTitles = new Map<string, number>();
  for (const p of projects) {
    const norm = p.title.trim().toLowerCase();
    if (norm) {
      seenTitles.set(norm, (seenTitles.get(norm) ?? 0) + 1);
    }
  }

  projects.forEach((project, idx) => {
    const itemErrors = validateProjectItem(project, idx, {
      hasPendingImage: pendingImageIds?.has(project.id),
    });

    const normTitle = project.title.trim().toLowerCase();
    if (normTitle && (seenTitles.get(normTitle) ?? 0) > 1) {
      itemErrors.push(
        `Project title "${project.title.trim()}" is duplicated across cards.`
      );
    }

    if (itemErrors.length > 0) {
      errorsByProject[project.id] = itemErrors;
      errors.push(...itemErrors);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    errorsByProject,
  };
}

export function sanitizeDeviceLabel(raw: string, maxLength = 60): string {
  return raw
    .replace(/[\r\n\t\x00-\x1f]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trimStart()
    .slice(0, maxLength);
}

export const clientTelemetrySchema = z.object({
  suggestedName: z.string().trim().max(80).default("Registered Device"),
  model: z.string().trim().max(80).default("Browser"),
  platform: z.string().trim().max(48).default("Unknown OS"),
  osVersion: z.string().trim().max(32).default(""),
  browser: z.string().trim().max(48).default("Unknown Browser"),
  architecture: z.string().trim().max(32).nullable().optional().default(null),
  cpuCores: z.number().int().min(1).max(256).nullable().optional().default(null),
  gpuRenderer: z.string().trim().max(80).nullable().optional().default(null),
  screenMetrics: z.string().trim().max(32).nullable().optional().default(null),
  timezone: z.string().trim().max(64).nullable().optional().default(null),
  deviceType: z.enum(["desktop", "mobile", "tablet"]).default("desktop"),
  keyThumbprint: z.string().trim().max(48).nullable().optional().default(null),
  publicKeySpki: z.string().trim().max(512).nullable().optional().default(null),
  secureContext: z.boolean().default(false),
});

export const deviceMetadataSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Device name must be at least 2 characters.")
    .max(60, "Device name must not exceed 60 characters."),
});

export const pairVerifySchema = z.object({
  challengeId: z.string().trim().min(16).max(128),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Please enter the exact 6-digit verification code."),
  deviceName: z
    .string()
    .trim()
    .min(2, "Device name must be at least 2 characters.")
    .max(60, "Device name must not exceed 60 characters."),
  telemetry: clientTelemetrySchema,
});

const restoreImageTransformSchema = z
  .object({
    zoom: z.number().min(0.5).max(4).optional(),
    offsetXPercent: z.number().min(-100).max(100).optional(),
    offsetYPercent: z.number().min(-100).max(100).optional(),
    rotation: z.number().min(-360).max(360).optional(),
    fit: z.enum(["cover", "contain"]).optional(),
    aspect: z.enum(["1:1", "3:4", "4:3", "16:9", "original"]).optional(),
    clipCircle: z.boolean().optional(),
  })
  .optional();

const restorePsgcAddressSchema = z
  .object({
    regionCode: z.string().max(32),
    regionName: z.string().max(120),
    provinceCode: z.string().max(32).optional(),
    provinceName: z.string().max(120).optional(),
    cityCode: z.string().max(32),
    cityName: z.string().max(120),
    barangayCode: z.string().max(32).optional(),
    barangayName: z.string().max(120).optional(),
  })
  .optional();

const restoreProfileSchema = z.object({
  name: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  middleName: z.string().max(80).default(""),
  fullName: z.string().min(2).max(140),
  monogram: z.string().min(1).max(8),
  monogramImageUrl: z.string().max(600).optional(),
  monogramTransform: restoreImageTransformSchema,
  birthDate: z.string().max(24).optional().default("2003-09-12"),
  age: z.number().int().min(15).max(120).optional(),
  avatarUrl: z.string().max(600),
  avatarTransform: restoreImageTransformSchema,
  resumeUrl: z.string().max(600).default(""),
  education: z.object({
    degree: z.string().max(160),
    major: z.string().max(160),
    graduationYear: z.number().int().min(1980).max(2060),
    status: z.string().max(120),
  }),
  headline: z.string().min(2).max(200),
  roles: z.array(z.string().max(100)).min(1).max(20),
  bio: z.string().min(2).max(2000),
  heroCtaPrimary: z.string().max(80),
  heroCtaSecondary: z.string().max(80),
  heroScrollCue: z.string().max(80),
  storyHeading: z.string().max(200),
  storyBody: z.array(z.string().max(2000)).max(20),
  contact: z.object({
    email: z.string().max(160),
    github: z.string().max(300),
    linkedin: z.string().max(300),
    location: z.string().max(200),
    address: restorePsgcAddressSchema,
    status: z.string().max(120),
  }),
});

export const restoreSectionHeadersSchema = z.object({
  storyEyebrow: z.string().max(200),
  skillsEyebrow: z.string().max(200),
  skillsHeading: z.string().max(240),
  skillsSubtitle: z.string().max(500),
  projectsEyebrow: z.string().max(200),
  projectsHeading: z.string().max(240),
  projectsCounterLabel: z.string().max(160),
  impactEyebrow: z.string().max(200),
  impactHeading: z.string().max(240),
  contactEyebrow: z.string().max(200),
  contactHeading: z.string().max(240),
  contactSubtitle: z.string().max(600),
  contactFormTitle: z.string().max(200),
  contactFormSubtitle: z.string().max(500),
  footerTagline: z.string().max(300),
});

export const restoreMarqueePrinciplesSchema = z.array(z.string().max(160)).max(40);

export const restorePillarsSchema = z
  .array(
    z.object({
      number: z.string().max(16),
      title: z.string().max(140),
      description: z.string().max(600),
    })
  )
  .max(20);

export const restoreSkillsSchema = z
  .array(
    z.object({
      id: z.string().max(80),
      title: z.string().max(120),
      eyebrow: z.string().max(120),
      description: z.string().max(400),
      skills: z
        .array(
          z.object({
            name: z.string().max(100),
            level: z.string().max(60),
            highlight: z.boolean().optional(),
          })
        )
        .max(50),
    })
  )
  .max(20);

export const restoreProjectsSchema = z
  .array(
    z.object({
      id: z.string().max(100),
      title: z.string().max(160),
      category: z.string().max(100),
      year: z.string().max(32),
      role: z.string().max(160),
      outcome: z.string().max(400),
      description: z.string().max(2000),
      problem: z.string().max(2000),
      solution: z.string().max(2000),
      stack: z.array(z.string().max(80)).max(30),
      image: z.string().max(600),
      metrics: z.string().max(300),
      githubUrl: z.string().max(400).optional(),
      liveUrl: z.string().max(400).optional(),
      featured: z.boolean(),
      published: z.boolean().optional(),
    })
  )
  .max(60);

export const restoreImpactMetricsSchema = z
  .array(
    z.object({
      value: z.string().max(32),
      prefix: z.string().max(24).optional(),
      suffix: z.string().max(24).optional(),
      label: z.string().max(140),
      description: z.string().max(500),
    })
  )
  .max(24);

export const portfolioRestoreSchema = z.object({
  profile: restoreProfileSchema.optional(),
  sectionHeaders: restoreSectionHeadersSchema.optional(),
  marqueePrinciples: restoreMarqueePrinciplesSchema.optional(),
  pillars: restorePillarsSchema.optional(),
  skills: restoreSkillsSchema.optional(),
  projects: restoreProjectsSchema.optional(),
  impactMetrics: restoreImpactMetricsSchema.optional(),
  messages: z
    .array(
      z.object({
        id: z.string().max(120),
        name: z.string().max(140),
        email: z.string().max(200),
        subject: z.string().max(240),
        message: z.string().max(4000),
        isRead: z.boolean(),
        isStarred: z.boolean(),
        emailDispatchStatus: z.enum(["sent", "skipped", "failed"]).optional(),
        repliedAt: z.string().max(64).nullable().optional(),
        replyCount: z.number().int().min(0).max(1000).optional(),
        lastReplySubject: z.string().max(240).nullable().optional(),
        createdAt: z.string().max(64),
      })
    )
    .max(5000)
    .optional(),
  analytics: z
    .array(
      z.object({
        id: z.string().max(120),
        type: z.enum([
          "page_view",
          "chapter_view",
          "project_click",
          "contact_click",
          "cv_download",
        ]),
        target: z.string().max(240),
        createdAt: z.string().max(64),
        sessionId: z.string().max(64).optional(),
        device: z.enum(["desktop", "tablet", "mobile"]).optional(),
        referrer: z.string().max(120).optional(),
      })
    )
    .max(25000)
    .optional(),
  appearance: z
    .object({
      defaultTheme: z.enum(["dark", "light", "system"]).optional(),
      accentPreset: z
        .enum([
          "vermilion",
          "ember",
          "cobalt",
          "emerald",
          "violet",
          "crimson",
          "custom",
        ])
        .optional(),
      customAccentHex: z
        .string()
        .trim()
        .regex(/^#[0-9a-fA-F]{6}$/, "Custom accent must be a #RRGGBB hex color.")
        .optional(),
      fontPairing: z.enum(["editorial", "geometric", "monolith"]).optional(),
      displayScale: z.enum(["compact", "standard", "large"]).optional(),
      surfaceRadius: z.enum(["sharp", "balanced", "soft"]).optional(),
      canvasTexture: z.enum(["clean", "grid", "dots"]).optional(),
      navbarStyle: z.enum(["glass", "solid"]).optional(),
      motionMode: z.enum(["system", "full", "reduced"]).optional(),
      smoothScroll: z.boolean().optional(),
      preloaderMode: z.enum(["always", "once-per-session", "off"]).optional(),
      marqueeSpeed: z.enum(["slow", "normal", "fast"]).optional(),
      magneticCursor: z.boolean().optional(),
      liquidDistortion: z.boolean().optional(),
      imageColorMode: z.enum(["grayscale-hover", "always-color"]).optional(),
      heroRimGlow: z.boolean().optional(),
      projectsLayout: z.enum(["staggered", "aligned"]).optional(),
    })
    .optional(),
});

export const appearanceConfigSchema = z.object({
  defaultTheme: z.enum(["dark", "light", "system"]),
  accentPreset: z.enum([
    "vermilion",
    "ember",
    "cobalt",
    "emerald",
    "violet",
    "crimson",
    "custom",
  ]),
  customAccentHex: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Custom accent must be a valid #RRGGBB hex color."),
  fontPairing: z.enum(["editorial", "geometric", "monolith"]),
  displayScale: z.enum(["compact", "standard", "large"]),
  surfaceRadius: z.enum(["sharp", "balanced", "soft"]),
  canvasTexture: z.enum(["clean", "grid", "dots"]),
  navbarStyle: z.enum(["glass", "solid"]),
  motionMode: z.enum(["system", "full", "reduced"]),
  smoothScroll: z.boolean(),
  preloaderMode: z.enum(["always", "once-per-session", "off"]),
  marqueeSpeed: z.enum(["slow", "normal", "fast"]),
  magneticCursor: z.boolean(),
  liquidDistortion: z.boolean(),
  imageColorMode: z.enum(["grayscale-hover", "always-color"]),
  heroRimGlow: z.boolean(),
  projectsLayout: z.enum(["staggered", "aligned"]),
});

export const restoreSectionsSchema = z.object({
  profile: z.boolean().default(true),
  narrative: z.boolean().default(true),
  skills: z.boolean().default(true),
  projects: z.boolean().default(true),
  appearance: z.boolean().default(true),
  messages: z.boolean().default(false),
  analytics: z.boolean().default(false),
});

export type RestoreSectionFlags = z.infer<typeof restoreSectionsSchema>;


