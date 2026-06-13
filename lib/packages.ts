export type PackageId = "starter" | "growth" | "pro";

export const PACKAGES = [
  {
    id: "starter" as PackageId,
    label: "Starter",
    maxFlats: 100,
    priceLabel: "PKR 15,000/mo",
    recommended: false,
    description: "Up to 100 flats — flat monthly fee, no per-unit charges.",
  },
  {
    id: "growth" as PackageId,
    label: "Growth",
    maxFlats: 400,
    priceLabel: "PKR 100/flat/mo",
    recommended: true,
    description: "101–400 flats — pay per flat, most popular for mid-size societies.",
  },
  {
    id: "pro" as PackageId,
    label: "Pro",
    maxFlats: 9999,
    priceLabel: "PKR 50/flat/mo",
    recommended: false,
    description: "401+ flats — best per-flat rate for large housing societies.",
  },
] as const;

export type Package = (typeof PACKAGES)[number];

export function getPackageForFlats(n: number): Package {
  for (const pkg of PACKAGES) {
    if (n <= pkg.maxFlats) return pkg;
  }
  return PACKAGES[PACKAGES.length - 1];
}
