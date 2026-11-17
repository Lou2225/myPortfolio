import type { MetadataRoute } from "next";
import { getSiteOrigin } from "@/lib/siteUrl";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/admin/pair", "/api/admin", "/offline"],
      },
    ],
    sitemap: `${getSiteOrigin()}/sitemap.xml`,
  };
}

