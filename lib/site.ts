// Canonical public origin for the Pulse BMS marketing surface. Used for
// metadata, canonical URLs, sitemap, robots and JSON-LD. Overridable per
// environment via NEXT_PUBLIC_SITE_URL (set on Vercel).
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://building.yourpulse.io";
