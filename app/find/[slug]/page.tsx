import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicBuildingDetail } from "@/app/actions/listings";
import { BuildingDetailClient } from "@/components/find/building-detail-client";

// 60s ISR — same trade as /find; mutations call revalidatePath("/find/<id>")
// for instant invalidation.
export const revalidate = 60;

type Params = { slug: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  // React.cache in the action means this query is deduped with the page below.
  const b = await getPublicBuildingDetail(slug);
  if (!b) return { title: "Building not found — Pulse BMS" };
  return {
    title: `${b.name} — Available flats | Pulse BMS`,
    description: `${b.listings.length} ${b.listings.length === 1 ? "flat" : "flats"} available at ${b.name}${b.city ? `, ${b.city}` : ""}. Contact via WhatsApp.`,
    openGraph: {
      title: `${b.name} — Available flats`,
      description: `${b.listings.length} flats listed by owners. Talk to the Union directly.`,
      type: "website",
    },
  };
}

export default async function FindBuildingDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const building = await getPublicBuildingDetail(slug);
  if (!building) {
    notFound();
  }

  return (
    <div className="min-h-screen">
      <div className="border-b border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link
            href="/find"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to all buildings
          </Link>
          <Link href="/login" className="text-xs text-primary hover:underline">
            Admin sign in
          </Link>
        </div>
      </div>
      <BuildingDetailClient building={building} />
    </div>
  );
}
