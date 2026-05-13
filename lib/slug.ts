// URL slug helpers — give pretty URLs for admin pages without exposing raw UUIDs.
// Pattern: <kebab-name>-<last-8-of-uuid>  (e.g. "abdul-sattar-00000006")
// The 8-char hex suffix is unique enough for any small dataset; on lookup we
// query by `id LIKE '%-<suffix>'` which matches one row in practice.

export function slugify(name: string | null | undefined): string {
  return (name ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

export function shortId(uuid: string): string {
  // last 8 chars of the UUID (drop dashes first so we always get hex)
  const hex = uuid.replace(/-/g, "");
  return hex.slice(-8);
}

/** Build a URL-friendly slug: "abdul-sattar-00000006" */
export function buildSlug(name: string | null | undefined, id: string): string {
  const base = slugify(name) || "x";
  return `${base}-${shortId(id)}`;
}

/** Extract the 8-char id-suffix from a slug like "abdul-sattar-00000006". */
export function parseSlugSuffix(slug: string): string | null {
  const parts = slug.split("-");
  const last = parts[parts.length - 1];
  if (!last || !/^[0-9a-f]{4,16}$/i.test(last)) return null;
  return last.toLowerCase();
}
