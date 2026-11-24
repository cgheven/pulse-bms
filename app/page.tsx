import { getSession } from "@/lib/auth";
import { ROLE_HOME } from "@/types";
import { LandingPage } from "@/components/landing/landing-page";
import { landingFaqs } from "@/components/landing/faqs";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

const DESCRIPTION =
  "Pulse BMS is building management software for apartment buildings and housing societies in Pakistan — maintenance billing, payment collection, residents, staff, expenses and transparent building finances in one platform.";

// Structured data so Google can understand the product, the brand and the FAQ
// (eligible for rich results). Kept server-side in the public landing route.
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "Pulse BMS",
      url: `${SITE_URL}/`,
      logo: `${SITE_URL}/logo.jpeg`,
      sameAs: [
        "https://www.yourpulse.io",
        "https://www.linkedin.com/company/yourpulse-io",
        "https://www.facebook.com/getpulsehub",
      ],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: "Pulse BMS",
      url: `${SITE_URL}/`,
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#software`,
      name: "Pulse BMS",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: DESCRIPTION,
      url: `${SITE_URL}/`,
      image: `${SITE_URL}/opengraph-image`,
      provider: { "@id": `${SITE_URL}/#organization` },
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "PKR",
        description: "Free to start",
      },
    },
    {
      "@type": "FAQPage",
      mainEntity: landingFaqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ],
};

export default async function Home() {
  // The root is a public marketing page for everyone. We no longer redirect
  // signed-in users away — instead the landing nav shows a "Go to dashboard"
  // link when a session exists, and Log in / Start free trial when it doesn't.
  const s = await getSession();
  const appHref = s ? ROLE_HOME[s.profile.role] : null;
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <LandingPage appHref={appHref} />
    </>
  );
}
