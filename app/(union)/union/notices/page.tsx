import { Pin, Megaphone } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { NoticeForm, DeleteNoticeButton } from "@/components/union/notice-form";

export const dynamic = "force-dynamic";

const TYPE_CLASS: Record<string, string> = {
  general: "bg-secondary text-foreground",
  urgent: "bg-red-100 text-red-800",
  maintenance: "bg-amber-100 text-amber-800",
  event: "bg-blue-100 text-blue-800",
};

export default async function UnionNoticesPage() {
  const { profile } = await requireRole("union");
  if (!profile.building_id) {
    return (
      <div className="card-soft">
        <h1>Notices</h1>
        <p className="text-muted-foreground mt-2">No building assigned.</p>
      </div>
    );
  }
  const supabase = await createClient();

  const { data: notices } = await supabase
    .from("bms_notices")
    .select("id, title, body, notice_type, pinned, expires_at, created_at, created_by")
    .eq("building_id", profile.building_id)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6 animate-fade-up">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1>Notices</h1>
          <p className="text-muted-foreground mt-1">
            Anything you post here is visible to all residents of this building.
          </p>
        </div>
        <NoticeForm />
      </header>

      {(notices ?? []).length === 0 ? (
        <div className="card-soft text-center text-muted-foreground py-12">
          <Megaphone className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
          No notices yet. Post the first one.
        </div>
      ) : (
        <div className="space-y-3">
          {(notices ?? []).map((n) => (
            <div key={n.id} className="card-soft">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {n.pinned && <Pin className="w-4 h-4 text-primary" />}
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        TYPE_CLASS[n.notice_type ?? "general"] ?? TYPE_CLASS.general
                      }`}
                    >
                      {n.notice_type ?? "general"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Posted {formatDate(n.created_at)}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold">{n.title}</h3>
                </div>
                <DeleteNoticeButton id={n.id} />
              </div>
              <p className="mt-3 whitespace-pre-wrap text-base leading-relaxed">{n.body}</p>
              {n.expires_at && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Expires {formatDate(n.expires_at)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
