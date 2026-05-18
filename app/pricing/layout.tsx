// Public marketing layout — no AppShell, no auth.

export const metadata = {
  title: "Pricing — Pulse",
  description:
    "Maintenance billing, union governance, building marketplace. PKR pricing for every residential building size in Pakistan.",
  openGraph: {
    title: "Pulse — Pricing",
    description:
      "Run your building like a startup. Pricing built for Pakistani residential societies.",
    type: "website",
  },
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen bg-background">{children}</div>;
}
