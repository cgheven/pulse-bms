import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, capitalize } from "@/lib/utils";
import { StatusPill, PriorityPill } from "@/components/resident/status-pill";
import { ComplaintDialog } from "@/components/resident/complaint-dialog";

type ComplaintRow = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  priority: string | null;
  status: string | null;
  resolution: string | null;
  flat_id: string | null;
  raised_by: string | null;
  created_at: string;
  resolved_at: string | null;
  bms_staff: { full_name: string; role: string } | { full_name: string; role: string }[] | null;
};

export default async function ResidentComplaintsPage() {
  const { profile } = await requireRole("resident");
  const supabase = await createClient();

  const { data: residentRows } = await supabase
    .from("bms_residents")
    .select("flat_id")
    .eq("profile_id", profile.id)
    .eq("is_active", true);
  const flatIds = (residentRows ?? []).map((r) => r.flat_id).filter(Boolean) as string[];

  let complaints: ComplaintRow[] = [];
  if (profile.building_id) {
    let query = supabase
      .from("bms_complaints")
      .select("id, title, description, category, priority, status, resolution, flat_id, raised_by, created_at, resolved_at, bms_staff:assigned_to(full_name, role)")
      .eq("building_id", profile.building_id)
      .order("created_at", { ascending: false });

    if (flatIds.length > 0) {
      const flatList = flatIds.map((f) => `"${f}"`).join(",");
      query = query.or(`raised_by.eq.${profile.id},flat_id.in.(${flatList})`);
    } else {
      query = query.eq("raised_by", profile.id);
    }
    const { data } = await query;
    complaints = (data ?? []) as unknown as ComplaintRow[];
  }

  const openCount = complaints.filter((c) => c.status !== "resolved" && c.status !== "closed").length;
  const resolvedCount = complaints.filter((c) => c.status === "resolved" || c.status === "closed").length;

  return (
    <div className="space-y-8 animate-fade-up">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-4xl font-bold">My Complaints</h1>
          <p className="text-lg text-muted-foreground mt-2">
            Raise a complaint for any issue in the building.
          </p>
        </div>
        <ComplaintDialog />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="card-soft">
          <div className="text-sm text-muted-foreground">Total</div>
          <div className="text-3xl font-bold mt-1">{complaints.length}</div>
        </div>
        <div className="card-soft">
          <div className="text-sm text-muted-foreground">Open</div>
          <div className={`text-3xl font-bold mt-1 ${openCount > 0 ? "text-destructive" : ""}`}>
            {openCount}
          </div>
        </div>
        <div className="card-soft">
          <div className="text-sm text-muted-foreground">Resolved</div>
          <div className="text-3xl font-bold mt-1 text-[hsl(151_70%_28%)]">{resolvedCount}</div>
        </div>
      </div>

      {complaints.length === 0 ? (
        <div className="card-soft text-base text-muted-foreground">
          No complaints raised yet. Click <span className="font-semibold">Raise Complaint</span> above to start.
        </div>
      ) : (
        <div className="space-y-4">
          {complaints.map((c) => {
            const staff = Array.isArray(c.bms_staff) ? c.bms_staff[0] : c.bms_staff;
            return (
              <div key={c.id} className="card-soft">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-xl font-bold">{c.title}</h3>
                      <StatusPill status={c.status} />
                      <PriorityPill priority={c.priority} />
                      {c.category && (
                        <span className="text-sm px-3 py-1 rounded-full bg-secondary text-foreground">
                          {capitalize(c.category)}
                        </span>
                      )}
                    </div>
                    {c.description && (
                      <p className="text-base text-muted-foreground mt-2 whitespace-pre-wrap">
                        {c.description}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm text-muted-foreground">Raised on</div>
                    <div className="text-base font-semibold">{formatDate(c.created_at)}</div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-base">
                  <div>
                    <div className="text-sm text-muted-foreground">Assigned to</div>
                    <div className="font-semibold">
                      {staff ? `${staff.full_name} (${capitalize(staff.role.replace("_", " "))})` : "Not yet assigned"}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Resolution</div>
                    <div className="font-semibold">
                      {c.resolution ? c.resolution : c.resolved_at ? "Resolved" : "—"}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
