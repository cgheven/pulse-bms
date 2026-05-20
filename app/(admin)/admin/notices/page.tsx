import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate } from "@/lib/utils";
import { AddNoticeButton } from "@/components/admin/notices/add-notice-button";
import { NoticeRowActions } from "@/components/admin/notices/notice-row-actions";
import { Pin, Megaphone } from "lucide-react";
import type { NoticeInput, NoticeType } from "@/app/actions/notices";
import { TableSkeleton } from "@/components/layout/table-skeleton";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<NoticeType, string> = {
  general: "General",
  dues_reminder: "Dues Reminder",
  meeting: "Meeting",
  election: "Election",
  emergency: "Emergency",
};

const TYPE_PILL: Record<NoticeType, string> = {
  general:       "bg-secondary text-muted-foreground border border-border",
  dues_reminder: "status-pending",
  meeting:       "status-info",
  election:      "status-info",
  emergency:     "status-overdue",
};

export default function NoticesPage() {
  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
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

async function loadNoticesData() {
  const { profile } = await requireRole(["admin", "super_admin"]);
  const supabase = await createClient();

  const { data: notices } = await supabase
    .from("bms_notices")
    .select("*")
    .eq("building_id", profile.building_id)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });

  // Build dues-reminder template from CURRENT-MONTH defaulters specifically.
  // We use per-invoice gap (amount - paid_total), not flats.outstanding_dues,
  // so residents who paid Rs. 500 of a Rs. 5000 bill see "Rs. 4,500 baqi"
  // instead of the full month. Senior-friendly: the message includes what
  // was already paid so the resident isn't confused.
  const today = new Date();
  const monthStart =
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  const monthLabel = today.toLocaleDateString("en-PK", {
    month: "long",
    year: "numeric",
  });

  const { data: currentInvoices } = await supabase
    .from("bms_invoices")
    .select("id, flat_id, amount, status, bms_flats(flat_number)")
    .eq("building_id", profile.building_id)
    .eq("billing_month", monthStart)
    .neq("status", "waived");

  type InvRow = {
    id: string;
    flat_id: string;
    amount: number;
    status: string | null;
    bms_flats:
      | { flat_number: string }
      | { flat_number: string }[]
      | null;
  };
  const invRows = (currentInvoices ?? []) as unknown as InvRow[];

  const paidByInvoice = new Map<string, number>();
  if (invRows.length > 0) {
    const { data: pays } = await supabase
      .from("bms_payments")
      .select("invoice_id, amount")
      .eq("building_id", profile.building_id)
      .in("invoice_id", invRows.map((i) => i.id));
    for (const p of pays ?? []) {
      if (!p.invoice_id) continue;
      paidByInvoice.set(
        p.invoice_id,
        (paidByInvoice.get(p.invoice_id) ?? 0) + Number(p.amount ?? 0),
      );
    }
  }

  type Defaulter = {
    flat_number: string;
    amount_total: number;
    amount_paid: number;
    amount_due: number;
  };
  const defaulters: Defaulter[] = invRows
    .map((i) => {
      const total = Number(i.amount);
      const paid = paidByInvoice.get(i.id) ?? 0;
      const flatRel = Array.isArray(i.bms_flats) ? i.bms_flats[0] : i.bms_flats;
      return {
        flat_number: flatRel?.flat_number ?? "—",
        amount_total: total,
        amount_paid: paid,
        amount_due: total - paid,
      };
    })
    .filter((d) => d.amount_due > 0)
    .sort((a, b) => b.amount_due - a.amount_due);

  let defaulterTemplate: string | undefined;
  if (defaulters.length > 0) {
    const lines = defaulters.map((d) => {
      // Roman-Urdu — what Pakistani chowkidars + senior residents read on WhatsApp.
      // Always include the GAP (amount_due) and what was already paid so the
      // message can't be misread as "you owe the full month again".
      const paidNote =
        d.amount_paid > 0
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

async function NoticesContent() {
  const { notices: list, defaulterTemplate } = await loadNoticesData();
  const pinned = list.filter((n) => n.pinned);
  const others = list.filter((n) => !n.pinned);
  const activeCount = list.filter(
    (n) => !n.expires_at || new Date(n.expires_at) > new Date(),
  ).length;

  return (
    <>
      {/* Stats sub-row */}
      <p className="text-muted-foreground -mt-2 text-sm flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5">
          <Megaphone className="w-3.5 h-3.5" />
          {list.length} notice{list.length === 1 ? "" : "s"}
        </span>
        {pinned.length > 0 && (
          <>
            <span className="hidden sm:inline">·</span>
            <span className="inline-flex items-center gap-1.5 text-primary">
              <Pin className="w-3.5 h-3.5" />
              {pinned.length} pinned
            </span>
          </>
        )}
        {activeCount < list.length && (
          <>
            <span className="hidden sm:inline">·</span>
            <span className="text-muted-foreground/70">
              {list.length - activeCount} expired
            </span>
          </>
        )}
      </p>

      {/* Empty state */}
      {list.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card/30 p-12 text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-3">
            <Megaphone className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">No notices yet</h3>
          <p className="text-muted-foreground text-sm mt-1">
            Click <span className="text-foreground font-medium">New Notice</span> to publish your first announcement.
          </p>
        </div>
      )}

      {/* Notice cards */}
      <div className="space-y-3">
        {[...pinned, ...others].map((n) => {
          const isExpired = n.expires_at && new Date(n.expires_at) < new Date();
          const type = (n.notice_type ?? "general") as NoticeType;
          return (
            <article
              key={n.id}
              className={`group relative rounded-xl border bg-card shadow-lg transition-all hover:shadow-xl overflow-hidden ${
                n.pinned ? "border-primary/30" : "border-border"
              } ${isExpired ? "opacity-60" : ""}`}
            >
              {/* Pinned left accent bar */}
              {n.pinned && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
              )}

              <div className="p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  {/* Title + meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {n.pinned && (
                        <Pin className="w-4 h-4 text-primary -rotate-45 shrink-0" />
                      )}
                      <h2 className="text-xl sm:text-2xl font-semibold tracking-tight leading-tight">
                        {n.title}
                      </h2>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${TYPE_PILL[type]}`}
                      >
                        {TYPE_LABELS[type] ?? n.notice_type}
                      </span>
                      {isExpired && (
                        <span className="status-overdue inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium">
                          Expired
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {n.created_at ? formatDate(n.created_at) : "—"}
                      </span>
                      {n.expires_at && !isExpired && (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          · expires {formatDate(n.expires_at)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions — icon-only, top-right, low-emphasis until hover */}
                  <div className="opacity-60 group-hover:opacity-100 transition-opacity">
                    <NoticeRowActions
                      notice={n as NoticeInput & { id: string }}
                      defaulterTemplate={defaulterTemplate}
                    />
                  </div>
                </div>

                {/* Body */}
                <div className="mt-4 whitespace-pre-wrap text-sm sm:text-base leading-relaxed text-foreground/85 border-l-2 border-border pl-4">
                  {n.body}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
