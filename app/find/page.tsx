import { Suspense } from "react";
import { getPublicBuildings } from "@/app/actions/listings";
import { FindHero, FindGrid, FindGridSkeleton } from "@/components/find/find-client";

// 60s ISR — the marketplace doesn't need second-by-second freshness, and we
// cache anon traffic at the edge so /find survives spikes without hammering
// the DB. Mutations call revalidatePath("/find") for instant invalidation.
export const revalidate = 60;

export const metadata = {
  title: "Find a Flat — Pulse BMS",
  description:
    "Discover flats for rent or sale, building by building. Contact the Union directly via WhatsApp — no broker fees.",
  openGraph: {
    title: "Find a Flat — Pulse BMS",
    description:
      "Browse verified residential buildings. Available flats for rent and sale, listed by their actual owners.",
    type: "website",
  },
};

export default function FindPage() {
  return (
    <div className="min-h-screen">
      <FindHero />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-5 sm:py-6">
        <Suspense fallback={<FindGridSkeleton />}>
          <FindGridLoader />
        </Suspense>
      </main>
      <footer className="border-t border-border mt-6 sm:mt-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          <p className="text-[11px] text-muted-foreground text-center">
            Pulse BMS — Building Management Software for Pakistan
          </p>
        </div>
      </footer>
    </div>
  );
}

async function FindGridLoader() {
  const buildings = await getPublicBuildings();
  return <FindGrid buildings={buildings} />;
}
