import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Keep the private app (per-role dashboards) and internal endpoints out of search.
      disallow: [
        "/api/",
        "/admin",
        "/super-admin",
        "/union",
        "/resident",
        "/guard",
        "/onboarding",
        "/no-building",
        "/invoice",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
