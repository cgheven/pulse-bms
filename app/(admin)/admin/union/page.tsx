import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MembersTab } from "@/components/admin/union/members-tab";
import { AddMemberButton } from "@/components/admin/union/add-member-button";
import { ElectionsTab } from "@/components/admin/union/elections-tab";

export const dynamic = "force-dynamic";

export default async function AdminUnionPage() {
  const { profile } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) {
    return (
      <div className="card-soft">
        <h1>Union management</h1>
        <p className="text-muted-foreground mt-2">No building assigned to your account.</p>
      </div>
    );
  }

  const supabase = await createClient();

  const [{ data: members }, { data: elections }, { data: candidates }] = await Promise.all([
    supabase
      .from("bms_union_members")
      .select("id, full_name, position, term_start, term_end, is_active, profile_id")
      .eq("building_id", profile.building_id)
      .order("is_active", { ascending: false })
      .order("term_start", { ascending: false }),
    supabase
      .from("bms_elections")
      .select("id, cycle_label, scheduled_date, status, results")
      .eq("building_id", profile.building_id)
      .order("scheduled_date", { ascending: false }),
    supabase
      .from("bms_profiles")
      .select("id, full_name, email")
      .eq("building_id", profile.building_id)
      .eq("role", "resident")
      .eq("is_active", true)
      .order("full_name", { ascending: true }),
  ]);

  return (
    <div className="space-y-6 animate-fade-up">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1>Union management</h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            Manage committee members and election cycles for this building.
          </p>
        </div>
        <AddMemberButton candidates={candidates ?? []} />
      </header>

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">
            Members ({members?.filter((m) => m.is_active).length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="elections">
            Elections ({elections?.length ?? 0})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="members" className="mt-4">
          <MembersTab members={members ?? []} />
        </TabsContent>
        <TabsContent value="elections" className="mt-4">
          <ElectionsTab elections={(elections ?? []) as never} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
