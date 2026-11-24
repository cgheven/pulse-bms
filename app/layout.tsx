import type { Metadata, Viewport } from "next";
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

export const metadata: Metadata = {
  // Required for link previews: Next.js resolves relative OG image paths
  // against this, and WhatsApp/Slack reject anything but absolute URLs.
  metadataBase: new URL(SITE_URL),
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
  alternates: { canonical: SITE_URL },
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
    url: SITE_URL,
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

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
