import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-image";

export const alt = "Find a Flat — Pulse BMS";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgImage({
    tagline: "Flats for rent and sale, listed by their actual owners.",
  });
}
