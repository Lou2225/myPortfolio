import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isAdminAuthenticated } from "@/lib/auth";
import {
  getPortfolioDB,
  savePortfolioDB,
  getDefaultSeedDatabase,
  getStorageMode,
  StorageReadError,
  StorageWriteError,
} from "@/lib/db";
import { pruneRelationalAnalytics } from "@/lib/relationalDb";
import { createPortfolioSnapshot } from "@/lib/backups";
import { calculateAge } from "@/lib/date";
import { sanitizeImageTransform } from "@/lib/imageTransform";
import {
  appearanceConfigSchema,
  restoreImpactMetricsSchema,
  restoreMarqueePrinciplesSchema,
  restorePillarsSchema,
  restoreProjectsSchema,
  restoreSectionHeadersSchema,
  restoreSkillsSchema,
  validateProfileDraft,
  validateProjectsDraft,
} from "@/lib/validation";
import { sanitizeAppearanceConfig } from "@/lib/appearance";
import { PortfolioDatabase } from "@/types/portfolio";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = await getPortfolioDB({ bypassCache: true });
    return NextResponse.json({
      data: db,
      storageMode: getStorageMode(),
    });
  } catch (err) {
    if (err instanceof StorageReadError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Failed to load portfolio database." },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as Partial<PortfolioDatabase>;

    let nextProfileError: string | null = null;
    const currentSnapshot = await getPortfolioDB();

    if (body.profile) {
      const candidateProfile = {
        ...currentSnapshot.profile,
        ...body.profile,
        education: {
          ...currentSnapshot.profile.education,
          ...(body.profile.education || {}),
        },
        contact: {
          ...currentSnapshot.profile.contact,
          ...(body.profile.contact || {}),
        },
        monogramTransform: body.profile.monogramTransform
          ? sanitizeImageTransform(body.profile.monogramTransform, "circle")
          : currentSnapshot.profile.monogramTransform,
        avatarTransform: body.profile.avatarTransform
          ? sanitizeImageTransform(body.profile.avatarTransform, "squircle")
          : currentSnapshot.profile.avatarTransform,
      };
      const syncedAge = calculateAge(candidateProfile.birthDate);
      if (syncedAge !== null) {
        candidateProfile.age = syncedAge;
      }
      const check = validateProfileDraft(candidateProfile);
      if (!check.valid) {
        nextProfileError = check.errors[0] || "Invalid profile data.";
      } else {
        body.profile = candidateProfile;
      }
    }

    if (nextProfileError) {
      return NextResponse.json({ error: nextProfileError }, { status: 400 });
    }

    let nextAppearance = currentSnapshot.appearance;
    if (body.appearance) {
      const mergedAppearance = sanitizeAppearanceConfig({
        ...currentSnapshot.appearance,
        ...body.appearance,
      });
      const parsedAppearance = appearanceConfigSchema.safeParse(mergedAppearance);
      if (!parsedAppearance.success) {
        return NextResponse.json(
          {
            error:
              parsedAppearance.error.issues[0]?.message ||
              "Invalid appearance configuration.",
          },
          { status: 400 }
        );
      }
      nextAppearance = parsedAppearance.data;
    }

    let nextSectionHeaders = currentSnapshot.sectionHeaders;
    if (body.sectionHeaders !== undefined) {
      const partialHeadersCheck = restoreSectionHeadersSchema
        .partial()
        .safeParse(body.sectionHeaders);
      if (!partialHeadersCheck.success) {
        return NextResponse.json(
          {
            error:
              partialHeadersCheck.error.issues[0]?.message ||
              "Invalid section headers payload.",
          },
          { status: 400 }
        );
      }
      nextSectionHeaders = {
        ...currentSnapshot.sectionHeaders,
        ...partialHeadersCheck.data,
      };
    }

    if (body.marqueePrinciples !== undefined) {
      const marqueeCheck = restoreMarqueePrinciplesSchema.safeParse(
        body.marqueePrinciples
      );
      if (!marqueeCheck.success) {
        return NextResponse.json(
          {
            error:
              marqueeCheck.error.issues[0]?.message ||
              "Invalid marquee principles payload.",
          },
          { status: 400 }
        );
      }
      body.marqueePrinciples = marqueeCheck.data;
    }

    if (body.pillars !== undefined) {
      const pillarsCheck = restorePillarsSchema.safeParse(body.pillars);
      if (!pillarsCheck.success) {
        return NextResponse.json(
          {
            error:
              pillarsCheck.error.issues[0]?.message ||
              "Invalid core pillars payload.",
          },
          { status: 400 }
        );
      }
      body.pillars = pillarsCheck.data;
    }

    if (body.skills !== undefined) {
      const skillsCheck = restoreSkillsSchema.safeParse(body.skills);
      if (!skillsCheck.success) {
        return NextResponse.json(
          {
            error:
              skillsCheck.error.issues[0]?.message ||
              "Invalid skills taxonomy payload.",
          },
          { status: 400 }
        );
      }
      body.skills = skillsCheck.data;
    }

    if (body.projects !== undefined) {
      const projectsSchemaCheck = restoreProjectsSchema.safeParse(body.projects);
      if (!projectsSchemaCheck.success) {
        return NextResponse.json(
          {
            error:
              projectsSchemaCheck.error.issues[0]?.message ||
              "Invalid projects payload.",
          },
          { status: 400 }
        );
      }
      const projectsDomainCheck = validateProjectsDraft(
        projectsSchemaCheck.data
      );
      if (!projectsDomainCheck.valid) {
        return NextResponse.json(
          {
            error:
              projectsDomainCheck.errors[0] || "Project validation failed.",
          },
          { status: 400 }
        );
      }
      body.projects = projectsSchemaCheck.data;
    }

    if (body.impactMetrics !== undefined) {
      const metricsCheck = restoreImpactMetricsSchema.safeParse(
        body.impactMetrics
      );
      if (!metricsCheck.success) {
        return NextResponse.json(
          {
            error:
              metricsCheck.error.issues[0]?.message ||
              "Invalid impact metrics payload.",
          },
          { status: 400 }
        );
      }
      body.impactMetrics = metricsCheck.data;
    }

    const updated = await savePortfolioDB((current) => ({
      ...current,
      profile: body.profile ? { ...current.profile, ...body.profile } : current.profile,
      sectionHeaders:
        body.sectionHeaders !== undefined
          ? nextSectionHeaders
          : current.sectionHeaders,
      marqueePrinciples: body.marqueePrinciples ?? current.marqueePrinciples,
      pillars: body.pillars ?? current.pillars,
      skills: body.skills ?? current.skills,
      projects: body.projects ?? current.projects,
      impactMetrics: body.impactMetrics ?? current.impactMetrics,
      appearance: body.appearance ? nextAppearance : current.appearance,
    }));

    revalidatePath("/", "layout");

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (err) {
    if (err instanceof StorageWriteError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Failed to save portfolio changes." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { action?: string };

    if (body.action === "clear-analytics") {
      await pruneRelationalAnalytics({ mode: "clear-all" });
      const updated = await getPortfolioDB({ bypassCache: true });
      return NextResponse.json({ success: true, data: updated });
    }

    if (body.action === "reset-seed") {
      const current = await getPortfolioDB({ bypassCache: true });
      await createPortfolioSnapshot({
        label: "Auto-checkpoint before Factory Reset",
        trigger: "pre-reset",
        db: current,
      });

      const seed = getDefaultSeedDatabase();
      const updated = await savePortfolioDB((curr) => ({
        ...seed,
        messages: curr.messages,
        analytics: curr.analytics,
      }));
      revalidatePath("/", "layout");
      return NextResponse.json({ success: true, data: updated });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    if (err instanceof StorageWriteError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}

