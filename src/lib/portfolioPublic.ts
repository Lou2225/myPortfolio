import { calculateAge } from "@/lib/date";
import type { PortfolioDatabase, PublicPortfolioData } from "@/types/portfolio";

/**
 * Strips private administrative fields (messages, raw analytics, birthDate,
 * detailed PSGC address codes) and unpublished draft projects from public SSR & API payloads.
 */
export function toPublicPortfolioPayload(
  db: PortfolioDatabase
): PublicPortfolioData {
  const syncedAge = calculateAge(db.profile.birthDate) ?? db.profile.age;
  const { address: omittedAddress, ...publicContact } = db.profile.contact;
  void omittedAddress;

  return {
    profile: {
      ...db.profile,
      birthDate: "",
      age: syncedAge,
      contact: publicContact,
    },
    sectionHeaders: db.sectionHeaders,
    marqueePrinciples: db.marqueePrinciples,
    pillars: db.pillars,
    skills: db.skills,
    certificates: (db.certificates || [])
      .filter((cert) => cert.published !== false)
      .sort((a, b) => a.order - b.order),
    projects: db.projects.filter((project) => project.published !== false),
    impactMetrics: db.impactMetrics,
    appearance: db.appearance,
    updatedAt: db.updatedAt,
  };
}
