import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, capitalize } from "@/lib/utils";
import { Pin, Megaphone } from "lucide-react";

type NoticeRow = {
  id: string;
  title: string;
  body: string;
  notice_type: string | null;
  pinned: boolean | null;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
  bms_profiles: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;
};

const TYPE_PILL: Record<string, string> = {
  general:     "status-info",
  maintenance: "status-pending",
  urgent:      "status-overdue",
  meeting:     "status-info",
  event:       "status-info",
};

export default async function ResidentNoticesPage() {
  const { profile } = await requireRole("resident");
  const supabase = await createClient();

  let notices: NoticeRow[] = [];
  if (profile.building_id) {
    const { data } = await supabase
      .from("bms_notices")
      .select("id, title, body, notice_type, pinned, expires_at, created_by, created_at, bms_profiles:created_by(full_name, email)")
      .eq("building_id", profile.building_id)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false });
    notices = (data ?? []) as unknown as NoticeRow[];
  }

  const now = Date.now();
  const active = notices.filter((n) => !n.expires_at || new Date(n.expires_at).getTime() > now);

  return (
    <div className="space-y-8 animate-fade-up">
      <div>
        <h1 className="text-4xl font-bold">Notices</h1>
        <p className="text-lg text-muted-foreground mt-2">Latest updates from your building admin and union.</p>
      </div>

      {active.length === 0 ? (
        <div className="card-soft text-base text-muted-foreground">
          No notices to show.
        </div>
      ) : (
        <div className="space-y-4">
          {active.map((n) => {
            const creator = Array.isArray(n.bms_profiles) ? n.bms_profiles[0] : n.bms_profiles;
            const creatorName = creator?.full_name ?? creator?.email ?? "Admin";
            const typeKey = (n.notice_type ?? "general").toLowerCase();
            const pillCls = TYPE_PILL[typeKey] ?? "status-info";
            return (
              <div
                key={n.id}
                className={`card-soft ${n.pinned ? "border-primary/40 ring-1 ring-primary/20" : ""}`}
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <Megaphone className="w-6 h-6 text-primary shrink-0 mt-1" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="text-2xl font-bold">{n.title}</h3>
                        {n.pinned && (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary text-primary-foreground text-sm font-semibold">
                            <Pin className="w-3.5 h-3.5" /> Pinned
                          </span>
                        )}
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${pillCls}`}>
                          {capitalize(n.notice_type ?? "General")}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        Posted by {creatorName} · {formatDate(n.created_at)}
                        {n.expires_at && (
                          <> · Expires {formatDate(n.expires_at)}</>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-4 text-base leading-relaxed whitespace-pre-wrap">
                  {n.body}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
