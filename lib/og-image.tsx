// Shared social-share banner renderer.
//
// Minimal Pulse-brand card: the gold "P" logo tile centered on near-black,
// matching the PulseHub (yourpulse.io) link preview so every Pulse surface
// shares the same WhatsApp/Slack/Twitter preview. No text — the mark alone.
//
// Next.js does NOT inherit `openGraph.images` into a nested segment that
// declares its own `openGraph` block — so /pricing and /find each keep their
// own `opengraph-image.tsx`. They all call this to stay visually identical.

import { ImageResponse } from "next/og";
import { readFileSync } from "fs";
import { join } from "path";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

// Signature kept (opts ignored) so existing callers compile; the brand card is
// identical for every page.
export function renderOgImage(_opts?: { heading?: string; tagline?: string }) {
  const logo = readFileSync(join(process.cwd(), "public", "logo.jpeg"));
  const logoSrc = `data:image/jpeg;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0E0E0E",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoSrc}
          width={400}
          height={400}
          style={{ borderRadius: 88, border: "1px solid rgba(255,255,255,0.14)" }}
          alt=""
        />
      </div>
    ),
    OG_SIZE,
  );
}
