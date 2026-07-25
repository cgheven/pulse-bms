import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-image";

export const alt = "Available flats — Pulse BMS";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgImage({
    tagline: "Available flats — talk to the Union directly.",
  });
}
