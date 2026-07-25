import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-image";

export const alt = "Pulse BMS — Pricing";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgImage({
    tagline: "Pricing built for Pakistani residential societies.",
  });
}
