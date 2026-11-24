import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { SITE_URL } from "@/lib/site";

// Typography standard (shared with HMS): DM Sans for the whole UI, DM Serif
// Display reserved for h1/h2 so headings read as premium editorial type.
const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
  weight: ["300", "400", "500", "600", "700"],
});

const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-serif",
  weight: "400",
  style: ["normal", "italic"],
});

const TITLE = "Building Management Software for Apartments & Societies | Pulse BMS";
const DESCRIPTION =
  "Pulse BMS is building management software for apartment buildings and housing societies in Pakistan — maintenance billing, payment collection, residents, staff, expenses and transparent building finances in one platform.";

// Resolve the public origin from the actual request host so OG/canonical URLs
// (and therefore the WhatsApp/Slack link-preview image) always point at the
// domain that served the page — e.g. https://building.yourpulse.io — regardless
// of the NEXT_PUBLIC_SITE_URL env value. Falls back to SITE_URL off-request.
async function resolveOrigin(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) {
      const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
      return `${proto}://${host}`;
    }
  } catch {
    // headers() unavailable (e.g. static context) — fall back below.
  }
  return SITE_URL;
}

export async function generateMetadata(): Promise<Metadata> {
  const origin = await resolveOrigin();
  return {
  // Required for link previews: Next.js resolves relative OG image paths
  // against this, and WhatsApp/Slack reject anything but absolute URLs.
  metadataBase: new URL(origin),
  title: {
    default: TITLE,
    template: "%s | Pulse BMS",
  },
  description: DESCRIPTION,
  applicationName: "Pulse BMS",
  keywords: [
    "building management software",
    "building management system",
    "apartment management software Pakistan",
    "society management system",
    "maintenance billing software",
    "maintenance collection software",
    "flat maintenance software",
    "apartment society accounts",
    "residential building management",
    "Pulse BMS",
  ],
  authors: [{ name: "Pulse BMS" }],
  alternates: { canonical: origin },
  icons: {
    icon: "/logo.jpeg",
    apple: "/logo.jpeg",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  openGraph: {
    type: "website",
    siteName: "Pulse BMS",
    locale: "en_PK",
    url: origin,
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${dmSerif.variable}`} suppressHydrationWarning>
      <body className="font-sans" suppressHydrationWarning>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
