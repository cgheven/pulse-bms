// Shared social-share banner renderer.
//
// Next.js does NOT inherit `openGraph.images` into a nested segment that
// declares its own `openGraph` block — so /pricing and /find each need their
// own `opengraph-image.tsx`. They all call this to stay visually identical.

import { ImageResponse } from "next/og";
import { readFileSync } from "fs";
import { join } from "path";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

export function renderOgImage(opts?: { heading?: string; tagline?: string }) {
  const heading = opts?.heading ?? "Pulse BMS";
  const tagline = opts?.tagline ?? "Run your building — transparent, simple, fair.";

  const logo = readFileSync(join(process.cwd(), "public", "logo.jpeg"));
  const logoSrc = `data:image/jpeg;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0D0A00",
          padding: 80,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc} width={160} height={160} style={{ borderRadius: 36 }} alt="" />
        <div
          style={{
            marginTop: 44,
            fontSize: 76,
            fontWeight: 700,
            color: "#FFFFFF",
            letterSpacing: "-0.03em",
          }}
        >
          {heading}
        </div>
        <div
          style={{
            marginTop: 20,
            fontSize: 30,
            fontWeight: 600,
            color: "#F0A92E",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}
        >
          Pulse of your Building
        </div>
        <div
          style={{
            marginTop: 36,
            fontSize: 28,
            color: "#94A3B8",
            textAlign: "center",
          }}
        >
          {tagline}
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
