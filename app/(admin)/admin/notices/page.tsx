import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveBuilding } from "@/lib/building-context";
import { formatCurrency, formatDate } from "@/lib/utils";
import { AddNoticeButton } from "@/components/admin/notices/add-notice-button";
import { NoticeRowActions } from "@/components/admin/notices/notice-row-actions";
import { Pin, Megaphone, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import type { NoticeInput, NoticeType } from "@/app/actions/notices";

type NoticeRow = NoticeInput & { id: string; created_at: string | null };
import { TableSkeleton } from "@/components/layout/table-skeleton";

export const dynamic = "force-dynamic";

/* ── type config ───────────────────────────────────────────────────────── */

const TYPE_LABELS: Record<NoticeType, string> = {
  general:       "General",
  dues_reminder: "Dues Reminder",
  meeting:       "Meeting",
  election:      "Election",
  emergency:     "Emergency",
};

const TYPE_PILL: Record<NoticeType, string> = {
  general:       "bg-secondary text-muted-foreground border border-border",
  dues_reminder: "status-pending",
  meeting:       "status-info",
  election:      "status-info",
  emergency:     "status-overdue",
};

const TYPE_ICON: Record<NoticeType, React.ReactNode> = {
  general:       null,
  dues_reminder: <Clock className="w-3 h-3" />,
  meeting:       <CheckCircle2 className="w-3 h-3" />,
  election:      <CheckCircle2 className="w-3 h-3" />,
  emergency:     <AlertTriangle className="w-3 h-3" />,
};

/* ── page shell ────────────────────────────────────────────────────────── */

export default function NoticesPage() {
  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1>Notices</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Announcements and updates for residents.
          </p>
        </div>
        <Suspense fallback={<AddNoticeButton defaulterTemplate={undefined} />}>
          <NoticesHeaderButton />
        </Suspense>
      </div>

      <Suspense fallback={<TableSkeleton rows={4} />}>
        <NoticesContent />
      </Suspense>
    </div>
  );
}

/* ── data loader ───────────────────────────────────────────────────────── */

async function loadNoticesData() {
  const { profile } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  const supabase = await createClient();

  const { data: notices } = await supabase
    .from("bms_notices")
    .select("*")
    .eq("building_id", buildingId)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  const today = new Date();
  const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  const monthLabel = today.toLocaleDateString("en-PK", { month: "long", year: "numeric" });

  const { data: currentInvoices } = await supabase
    .from("bms_invoices")
    .select("id, flat_id, amount, status, bms_flats(flat_number)")
    .eq("building_id", buildingId)
    .eq("billing_month", monthStart)
    .neq("status", "waived");

  type InvRow = {
    id: string; flat_id: string; amount: number; status: string | null;
    bms_flats: { flat_number: string } | { flat_number: string }[] | null;
  };
  const invRows = (currentInvoices ?? []) as unknown as InvRow[];

  const paidByInvoice = new Map<string, number>();
  if (invRows.length > 0) {
    const { data: pays } = await supabase
      .from("bms_payments")
      .select("invoice_id, amount")
      .eq("building_id", buildingId)
      .in("invoice_id", invRows.map((i) => i.id));
    for (const p of pays ?? []) {
      if (!p.invoice_id) continue;
      paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) ?? 0) + Number(p.amount ?? 0));
    }
  }

  const defaulters = invRows
    .map((i) => {
      const total = Number(i.amount);
      const paid  = paidByInvoice.get(i.id) ?? 0;
      const flatRel = Array.isArray(i.bms_flats) ? i.bms_flats[0] : i.bms_flats;
      return { flat_number: flatRel?.flat_number ?? "—", amount_total: total, amount_paid: paid, amount_due: total - paid };
    })
    .filter((d) => d.amount_due > 0)
    .sort((a, b) => b.amount_due - a.amount_due);

  let defaulterTemplate: string | undefined;
  if (defaulters.length > 0) {
    const lines = defaulters.map((d) => {
      const paidNote = d.amount_paid > 0
        ? ` (${formatCurrency(d.amount_paid)} mil chuke hain, total ${formatCurrency(d.amount_total)})`
        : ` (total ${formatCurrency(d.amount_total)})`;
      return `- Flat ${d.flat_number}: ${formatCurrency(d.amount_due)} baqi${paidNote}`;
    });
    const totalDue = defaulters.reduce((a, d) => a + d.amount_due, 0);
    defaulterTemplate = [
      "Dear Residents,",
      "",
      `Aap ki ${monthLabel} maintenance ke baqi rakam clear karne ki guzarish hai:`,
      "",
      ...lines,
      "",
      `Kul baqi: ${formatCurrency(totalDue)}`,
      "",
      "Partial payments bhi accept hote hain. Building office se rabta karein. Shukriya.",
      "",
      "— Building Admin",
    ].join("\n");
  }

  return { notices: notices ?? [], defaulterTemplate };
}

async function NoticesHeaderButton() {
  const { defaulterTemplate } = await loadNoticesData();
  return <AddNoticeButton defaulterTemplate={defaulterTemplate} />;
}

/* ── notice card ───────────────────────────────────────────────────────── */

function NoticeCard({
  n,
  defaulterTemplate,
  faded,
}: {
  n: NoticeRow & Record<string, unknown>;
  defaulterTemplate?: string;
  faded?: boolean;
}) {
  const isExpired = n.expires_at && new Date(n.expires_at) < new Date();
  const type = (n.notice_type ?? "general") as NoticeType;

  return (
    <article
      className={`group relative rounded-xl border bg-card overflow-hidden transition-shadow hover:shadow-md ${
        n.pinned ? "border-primary/40 shadow-sm" : "border-border shadow-sm"
      } ${faded ? "opacity-55" : ""}`}
    >
      {/* Pinned accent bar */}
      {n.pinned && (
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary" />
      )}

      <div className={`p-4 ${n.pinned ? "pl-5" : ""}`}>
        {/* Title row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            {n.pinned && (
              <Pin className="w-3.5 h-3.5 text-primary -rotate-45 shrink-0 mt-0.5" />
            )}
            <h2 className="text-sm font-semibold text-foreground leading-snug">
              {n.title}
            </h2>
          </div>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 -mt-1 -mr-1">
            <NoticeRowActions
              notice={n}
              defaulterTemplate={defaulterTemplate}
            />
          </div>
        </div>

        {/* Meta row */}
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${TYPE_PILL[type]}`}>
            {TYPE_ICON[type]}
            {TYPE_LABELS[type] ?? n.notice_type}
          </span>
          {n.pinned && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-primary/10 border border-primary/25 text-primary">
              <Pin className="w-2.5 h-2.5 -rotate-45" />
              Pinned
            </span>
          )}
          {isExpired && (
            <span className="status-overdue inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium">
              Expired
            </span>
          )}
          <span className="text-[11px] text-muted-foreground tabular-nums ml-0.5">
            {n.created_at ? formatDate(n.created_at) : "—"}
          </span>
          {n.expires_at && !isExpired && (
            <span className="text-[11px] text-muted-foreground tabular-nums">
              · expires {formatDate(n.expires_at)}
            </span>
          )}
        </div>

        {/* Body */}
        {n.body && (
          <div className="mt-3 pt-3 border-t border-border/60">
            <p className="text-xs leading-relaxed text-foreground/80 whitespace-pre-wrap">
              {n.body}
            </p>
          </div>
        )}
      </div>
    </article>
  );
}

/* ── content ───────────────────────────────────────────────────────────── */

async function NoticesContent() {
  const { notices: list, defaulterTemplate } = await loadNoticesData();

  const now = new Date();
  const active  = list.filter((n) => !n.expires_at || new Date(n.expires_at) > now);
  const expired = list.filter((n) => n.expires_at && new Date(n.expires_at) <= now);
  const pinned  = list.filter((n) => n.pinned).length;

  return (
    <>
      {/* Stats strip */}
      <div className="flex flex-wrap gap-2 -mt-2">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-secondary border border-border text-muted-foreground">
          <Megaphone className="w-3.5 h-3.5" />
          {list.length} notice{list.length !== 1 ? "s" : ""}
        </span>
        {pinned > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/10 border border-primary/25 text-primary">
            <Pin className="w-3.5 h-3.5 -rotate-45" />
            {pinned} pinned
          </span>
        )}
        {expired.length > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-secondary border border-border text-muted-foreground/70">
            <Clock className="w-3.5 h-3.5" />
            {expired.length} expired
          </span>
        )}
      </div>

      {/* Empty state */}
      {list.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card/30 p-12 text-center">
          <div className="mx-auto w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-3">
            <Megaphone className="w-5 h-5 text-primary" />
          </div>
          <p className="text-sm font-semibold text-foreground">No notices yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Click <span className="text-foreground font-medium">New Notice</span> to publish your first announcement.
          </p>
        </div>
      )}

      {/* Active notices */}
      {active.length > 0 && (
        <div className="space-y-2">
          {active.map((n) => (
            <NoticeCard
              key={n.id}
              n={n as NoticeRow}
              defaulterTemplate={defaulterTemplate}
            />
          ))}
        </div>
      )}

      {/* Expired notices — collapsed at bottom */}
      {expired.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 px-0.5">
            Expired ({expired.length})
          </p>
          {expired.map((n) => (
            <NoticeCard
              key={n.id}
              n={n as NoticeRow}
              defaulterTemplate={defaulterTemplate}
              faded
            />
          ))}
        </div>
      )}
    </>
  );
}
