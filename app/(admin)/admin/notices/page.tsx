import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate } from "@/lib/utils";
import { AddNoticeButton } from "@/components/admin/notices/add-notice-button";
import { NoticeRowActions } from "@/components/admin/notices/notice-row-actions";
import { Pin } from "lucide-react";
import type { NoticeInput, NoticeType } from "@/app/actions/notices";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<NoticeType, string> = {
  general: "General",
  dues_reminder: "Dues Reminder",
  meeting: "Meeting",
  election: "Election",
  emergency: "Emergency",
};

const TYPE_PILL: Record<NoticeType, string> = {
  general: "bg-secondary border",
  dues_reminder: "status-pending",
  meeting: "status-info",
  election: "status-info",
  emergency: "status-overdue",
};

export default async function NoticesPage() {
  const { profile } = await requireRole(["admin", "super_admin"]);
  const supabase = await createClient();

  const { data: notices } = await supabase
    .from("bms_notices")
    .select("*")
    .eq("building_id", profile.building_id)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });

  // Build dues-reminder template from current defaulters
  const { data: defaulters } = await supabase
    .from("bms_flats")
    .select("flat_number,outstanding_dues")
    .eq("building_id", profile.building_id)
    .gt("outstanding_dues", 0)
    .order("outstanding_dues", { ascending: false });

  let defaulterTemplate: string | undefined;
  if (defaulters && defaulters.length > 0) {
    const lines = defaulters.map(
      (d) =>
        `- Flat ${d.flat_number}: ${formatCurrency(Number(d.outstanding_dues))}`,
    );
    const total = defaulters.reduce(
      (a, d) => a + Number(d.outstanding_dues),
      0,
    );
    defaulterTemplate = [
      "Dear Residents,",
      "",
      "Kindly clear your outstanding maintenance dues at the earliest. Below is the current list of flats with pending balances:",
      "",
      ...lines,
      "",
      `Total outstanding: ${formatCurrency(total)}`,
      "",
      "Please contact the building office to settle your dues. Thank you for your cooperation.",
      "",
      "— Building Admin",
    ].join("\n");
  }

  const list = notices ?? [];
  const pinned = list.filter((n) => n.pinned);
  const others = list.filter((n) => !n.pinned);

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1>Notices</h1>
          <p className="text-muted-foreground mt-1">
            {list.length} notice{list.length === 1 ? "" : "s"} ·{" "}
            {pinned.length} pinned
          </p>
        </div>
        <AddNoticeButton defaulterTemplate={defaulterTemplate} />
      </div>

      {list.length === 0 && (
        <div className="card-soft text-center py-12 text-muted-foreground">
          No notices yet. Click "New Notice" to publish your first announcement.
        </div>
      )}

      <div className="space-y-4">
        {[...pinned, ...others].map((n) => {
          const isExpired =
            n.expires_at && new Date(n.expires_at) < new Date();
          return (
            <div
              key={n.id}
              className={`card-soft ${n.pinned ? "border-primary/40 bg-primary/5" : ""} ${isExpired ? "opacity-60" : ""}`}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    {n.pinned && (
                      <Pin className="w-4 h-4 text-primary" />
                    )}
                    <h2 className="text-2xl">{n.title}</h2>
                    <span
                      className={`${TYPE_PILL[n.notice_type as NoticeType] ?? "bg-secondary border"} px-2 py-0.5 rounded-full text-xs`}
                    >
                      {TYPE_LABELS[n.notice_type as NoticeType] ??
                        n.notice_type}
                    </span>
                    {isExpired && (
                      <span className="status-overdue px-2 py-0.5 rounded-full text-xs">
                        Expired
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Posted {n.created_at ? formatDate(n.created_at) : "—"}
                    {n.expires_at &&
                      ` · Expires ${formatDate(n.expires_at)}`}
                  </div>
                </div>
                <NoticeRowActions
                  notice={n as NoticeInput & { id: string }}
                  defaulterTemplate={defaulterTemplate}
                />
              </div>
              <div className="mt-3 whitespace-pre-wrap text-base leading-relaxed">
                {n.body}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
