import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MembersTab } from "@/components/admin/union/members-tab";
import { AddMemberButton } from "@/components/admin/union/add-member-button";
import { ElectionsTab } from "@/components/admin/union/elections-tab";
import { TableSkeleton } from "@/components/layout/table-skeleton";

export const dynamic = "force-dynamic";

export default function AdminUnionPage() {
  return (
    <div className="space-y-4 animate-fade-up">
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <UnionContent />
      </Suspense>
    </div>
  );
}

async function UnionContent() {
  const { profile } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) {
    return (
      <div className="card-soft">
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

  const activeCount = members?.filter((m) => m.is_active).length ?? 0;
  const electionsCount = elections?.length ?? 0;

  return (
    <>
      {/* Header — h1 + action inline. No subtitle (the tabs explain context). */}
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <h1>Union</h1>
        <AddMemberButton candidates={candidates ?? []} />
      </header>

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">
            Members
            <span className="ml-1.5 tabular-nums text-[10px] px-1.5 rounded-full bg-secondary">
              {activeCount}
            </span>
          </TabsTrigger>
          <TabsTrigger value="elections">
            Elections
            <span className="ml-1.5 tabular-nums text-[10px] px-1.5 rounded-full bg-secondary">
              {electionsCount}
            </span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="members" className="mt-3">
          <MembersTab members={members ?? []} />
        </TabsContent>
        <TabsContent value="elections" className="mt-3">
          <ElectionsTab elections={(elections ?? []) as never} />
        </TabsContent>
      </Tabs>
    </>
  );
}
