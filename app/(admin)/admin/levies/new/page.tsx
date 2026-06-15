import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveBuilding } from "@/lib/building-context";
import { LevyForm } from "@/components/levies/levy-form";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function NewLevyPage() {
  await requireRole(["admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) return null;

  const supabase = await createClient();
  const { count } = await supabase
    .from("bms_residents")
    .select("id", { count: "exact", head: true })
    .eq("building_id", buildingId)
    .eq("is_active", true);

  return (
    <div className="space-y-5 animate-fade-up max-w-4xl">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/levies"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1>New Special Levy</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Share a building cost equally among all active residents.
          </p>
        </div>
      </div>

      <LevyForm activeResidentCount={count ?? 0} />
    </div>
  );
}
