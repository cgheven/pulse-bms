import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { getActiveBuilding } from "@/lib/building-context";
import { createClient } from "@/lib/supabase/server";
import { getServiceContacts } from "@/app/actions/service-contacts";
import { ContactsBoard } from "@/components/service-contacts/contacts-board";
import { TableSkeleton } from "@/components/layout/table-skeleton";

export const dynamic = "force-dynamic";

export default function AdminContactsPage() {
  return (
    <div className="space-y-6 animate-fade-up">
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <ContactsContent />
      </Suspense>
    </div>
  );
}

async function ContactsContent() {
  await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) return <p className="text-muted-foreground">No active building selected.</p>;
  const supabase = await createClient();

  const [contacts, { data: building }] = await Promise.all([
    getServiceContacts(buildingId),
    supabase
      .from("bms_buildings")
      .select("name")
      .eq("id", buildingId)
      .maybeSingle(),
  ]);

  return (
    <ContactsBoard
      contacts={contacts}
      isAdmin
      buildingName={building?.name ?? undefined}
    />
  );
}
