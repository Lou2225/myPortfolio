import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { isAdminAuthenticated } from "@/lib/auth";
import {
  getPortfolioContent,
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
  validateCertificatesDraft,
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
    let body: Partial<PortfolioDatabase>;
    try {
      const parsed = await request.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return NextResponse.json(
          { error: "Invalid JSON request body." },
          { status: 400 }
        );
      }
      body = parsed as Partial<PortfolioDatabase>;
    } catch {
      return NextResponse.json(
        { error: "Malformed JSON request body." },
        { status: 400 }
      );
    }

    const currentSnapshot = await getPortfolioContent({ bypassCache: true });

    const rawProfilePatch = body.profile;
    let validatedProfileKeys: (keyof PortfolioDatabase["profile"])[] | null =
      null;
    let validatedProfileValue: PortfolioDatabase["profile"] | null = null;
    if (rawProfilePatch) {
      if (typeof rawProfilePatch !== "object" || Array.isArray(rawProfilePatch)) {
        return NextResponse.json(
          { error: "Invalid profile payload." },
          { status: 400 }
        );
      }
      const rawContactPatch = rawProfilePatch.contact as
        | (Partial<PortfolioDatabase["profile"]["contact"]> & {
            address?: PortfolioDatabase["profile"]["contact"]["address"] | null;
          })
        | undefined;
      const mergedContact = {
        ...currentSnapshot.profile.contact,
        ...(rawContactPatch || {}),
      };
      if (rawContactPatch && rawContactPatch.address === null) {
        delete mergedContact.address;
      }

      const candidateProfile = {
        ...currentSnapshot.profile,
        ...rawProfilePatch,
        education: {
          ...currentSnapshot.profile.education,
          ...(rawProfilePatch.education || {}),
        },
        contact: mergedContact,
        monogramTransform: rawProfilePatch.monogramTransform
          ? sanitizeImageTransform(rawProfilePatch.monogramTransform, "circle")
          : currentSnapshot.profile.monogramTransform,
        avatarTransform: rawProfilePatch.avatarTransform
          ? sanitizeImageTransform(rawProfilePatch.avatarTransform, "squircle")
          : currentSnapshot.profile.avatarTransform,
      };
      const syncedAge = calculateAge(candidateProfile.birthDate);
      if (syncedAge !== null) {
        candidateProfile.age = syncedAge;
      }
      const check = validateProfileDraft(candidateProfile);
      if (!check.valid) {
        return NextResponse.json(
          { error: check.errors[0] || "Invalid profile data." },
          { status: 400 }
        );
      }
      validatedProfileValue = candidateProfile;
      validatedProfileKeys = Object.keys(
        rawProfilePatch
      ) as (keyof PortfolioDatabase["profile"])[];
    }

    let validatedAppearancePatch: Partial<PortfolioDatabase["appearance"]> | null =
      null;
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
      validatedAppearancePatch = body.appearance;
    }

    let validatedHeaderPatch: Partial<PortfolioDatabase["sectionHeaders"]> | null =
      null;
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
      validatedHeaderPatch = partialHeadersCheck.data;
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

    if (body.certificates !== undefined) {
      if (!Array.isArray(body.certificates)) {
        return NextResponse.json(
          { error: "Certificates payload must be an array." },
          { status: 400 }
        );
      }
      const certCheck = validateCertificatesDraft(body.certificates);
      if (!certCheck.valid) {
        return NextResponse.json(
          {
            error: certCheck.errors[0] || "Certificate validation failed.",
          },
          { status: 400 }
        );
      }
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

    // Apply partial domain updates against the freshest serialized DB state inside savePortfolioDB
    // so concurrent edits across modules never clobber sibling fields.
    const updated = await savePortfolioDB((current) => {
      let nextProfile = current.profile;
      if (validatedProfileValue && validatedProfileKeys) {
        const mergedProfile: PortfolioDatabase["profile"] = {
          ...current.profile,
        };
        for (const key of validatedProfileKeys) {
          if (key === "education") {
            mergedProfile.education = {
              ...current.profile.education,
              ...validatedProfileValue.education,
            };
          } else if (key === "contact") {
            const rawContact = rawProfilePatch?.contact as
              | { address?: unknown }
              | undefined;
            const mergedContact = {
              ...current.profile.contact,
              ...validatedProfileValue.contact,
            };
            if (rawContact && rawContact.address === null) {
              delete mergedContact.address;
            }
            mergedProfile.contact = mergedContact;
          } else {
            (mergedProfile as unknown as Record<string, unknown>)[key] = (
              validatedProfileValue as unknown as Record<string, unknown>
            )[key];
          }
        }
        const syncedAge = calculateAge(mergedProfile.birthDate);
        if (syncedAge !== null) {
          mergedProfile.age = syncedAge;
        }
        nextProfile = mergedProfile;
      }

      return {
        ...current,
        profile: nextProfile,
        sectionHeaders: validatedHeaderPatch
          ? { ...current.sectionHeaders, ...validatedHeaderPatch }
          : current.sectionHeaders,
        marqueePrinciples: body.marqueePrinciples ?? current.marqueePrinciples,
        pillars: body.pillars ?? current.pillars,
        skills: body.skills ?? current.skills,
        certificates: body.certificates ?? current.certificates ?? [],
        projects: body.projects ?? current.projects,
        impactMetrics: body.impactMetrics ?? current.impactMetrics,
        appearance: validatedAppearancePatch
          ? sanitizeAppearanceConfig({
              ...current.appearance,
              ...validatedAppearancePatch,
            })
          : current.appearance,
      };
    });

    revalidatePath("/", "layout");

    return NextResponse.json(
      {
        success: true,
        data: updated,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    if (err instanceof StorageReadError || err instanceof StorageWriteError) {
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
    let body: { action?: string };
    try {
      const parsed = await request.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return NextResponse.json(
          { error: "Invalid JSON request body." },
          { status: 400 }
        );
      }
      body = parsed as { action?: string };
    } catch {
      return NextResponse.json(
        { error: "Malformed JSON request body." },
        { status: 400 }
      );
    }

    if (body.action === "clear-analytics") {
      await pruneRelationalAnalytics({ mode: "clear-all" });
      const updated = await getPortfolioDB({ bypassCache: true });
      return NextResponse.json(
        { success: true, data: updated },
        { headers: { "Cache-Control": "no-store" } }
      );
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
      return NextResponse.json(
        { success: true, data: updated },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    if (err instanceof StorageReadError || err instanceof StorageWriteError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}

