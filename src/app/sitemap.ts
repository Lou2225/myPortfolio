import type { MetadataRoute } from "next";
import { getPortfolioContent } from "@/lib/db";
import { getSiteOrigin } from "@/lib/siteUrl";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = getSiteOrigin();
  let lastModified = new Date();
  let projectUrls: MetadataRoute.Sitemap = [];

  try {
    const db = await getPortfolioContent();
    const parsed = new Date(db.updatedAt);
    if (!Number.isNaN(parsed.getTime())) {
      lastModified = parsed;
    }

    projectUrls = db.projects
      .filter((p) => p.published !== false && p.id.trim())
      .map((project) => ({
        url: `${origin}/projects/${encodeURIComponent(project.id)}`,
        lastModified,
        changeFrequency: "monthly" as const,
        priority: project.featured ? 0.9 : 0.8,
      }));
  } catch {
    // Fallback to root URL only if DB read is temporarily unavailable
  }

  return [
    {
      url: origin,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    ...projectUrls,
  ];
}
