import type { MetadataRoute } from "next";
import { profileData } from "@/data/portfolio";
import { DEFAULT_APPEARANCE } from "@/data/appearance";
import { getPortfolioContent } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let name = `${profileData.name} ${profileData.lastName} — ${profileData.headline}`;
  let shortName = profileData.monogram || "LDV";
  let description = profileData.bio;
  let canvasHex = DEFAULT_APPEARANCE.defaultTheme === "light" ? "#f5f2eb" : "#08080a";

  try {
    const db = await getPortfolioContent();
    const shortTitle = `${db.profile.name || profileData.name} ${db.profile.lastName || profileData.lastName}`;
    name = `${shortTitle} — ${db.profile.headline || profileData.headline}`;
    shortName = (db.profile.monogram || profileData.monogram || "LDV").slice(0, 12);
    description = db.profile.bio || profileData.bio;
    canvasHex = db.appearance.defaultTheme === "light" ? "#f5f2eb" : "#08080a";
  } catch {
    // Fall back to seed defaults if DB read is temporarily unreachable
  }

  return {
    id: "/",
    name,
    short_name: shortName,
    description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: canvasHex,
    theme_color: canvasHex,
    categories: ["portfolio", "developer", "technology"],
    shortcuts: [
      {
        name: "Selected Projects",
        short_name: "Projects",
        url: "/#projects",
      },
      {
        name: "Contact & Inquiries",
        short_name: "Contact",
        url: "/#contact",
      },
    ],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
