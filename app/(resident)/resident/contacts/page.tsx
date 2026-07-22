import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getServiceContacts } from "@/app/actions/service-contacts";
import { ContactsBoard } from "@/components/service-contacts/contacts-board";
import { TableSkeleton } from "@/components/layout/table-skeleton";

export const dynamic = "force-dynamic";

export default function ResidentContactsPage() {
  return (
    <div className="space-y-6 animate-fade-up">
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <ContactsContent />
      </Suspense>
    </div>
  );
}

async function ContactsContent() {
  const { profile } = await requireRole("resident");
  const buildingId = profile.building_id;
  if (!buildingId) return <p className="text-muted-foreground">No building assigned.</p>;

  const supabase = await createClient();
  const [contacts, { data: building }] = await Promise.all([
    getServiceContacts(),
    supabase
      .from("bms_buildings")
      .select("name")
      .eq("id", buildingId)
      .maybeSingle(),
  ]);

  return (
    <ContactsBoard
      contacts={contacts}
      buildingName={building?.name ?? undefined}
    />
  );
}
