// Shared enum — kept out of any "use server" file because Next.js only allows
// async-function exports from those.

export const SERVICE_CATEGORIES = [
  "tech_repair",
  "food_cooking",
  "home_services",
  "tutoring",
  "beauty_wellness",
  "transport",
  "pets",
  "other",
] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];
