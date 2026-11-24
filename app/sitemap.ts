import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  // Public, indexable pages only. The role dashboards live behind auth and are
  // excluded in robots.ts.
  const routes: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
    { path: "/", priority: 1.0, changeFrequency: "weekly" },
    { path: "/pricing", priority: 0.8, changeFrequency: "monthly" },
    { path: "/find", priority: 0.6, changeFrequency: "daily" },
  ];

  return routes.map(({ path, priority, changeFrequency }) => ({
    url: path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }));
}
