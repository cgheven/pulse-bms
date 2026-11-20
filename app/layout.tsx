import type { Metadata, Viewport } from "next";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

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

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://bms.yourpulse.io";

export const metadata: Metadata = {
  // Required for link previews: Next.js resolves relative OG image paths
  // against this, and WhatsApp/Slack reject anything but absolute URLs.
  metadataBase: new URL(SITE_URL),
  title: "Pulse BMS — Building Management System",
  description: "Run your building — transparent, simple, fair.",
  icons: {
    icon: "/logo.jpeg",
    apple: "/logo.jpeg",
  },
  openGraph: {
    type: "website",
    siteName: "Pulse BMS",
    url: SITE_URL,
    title: "Pulse BMS — Building Management System",
    description: "Run your building — transparent, simple, fair.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pulse BMS — Building Management System",
    description: "Run your building — transparent, simple, fair.",
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
