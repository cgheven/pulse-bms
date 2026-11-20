import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getActiveBuilding } from "@/lib/building-context";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate, formatMonthLabel, formatPhone } from "@/lib/utils";
import { amountInWords } from "@/lib/amount-in-words";
import { PrintReceiptButton } from "@/components/payments/print-receipt-button";

export const dynamic = "force-dynamic";

/**
 * Admin-scoped printable maintenance invoice (the bill). Opened in a new tab
 * from the "Preview Invoice" row action. Scoped to the caller's building so a
 * cross-tenant id probe 404s. Mirrors the receipt page's print setup
 * (`#print-area` + `.no-print`).
 */
export default async function InvoicePreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) notFound();
  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("bms_invoices")
    .select("id, invoice_number, billing_month, amount, due_date, status, flat_id")
    .eq("id", id)
    .eq("building_id", buildingId)
    .single();
  if (!invoice) notFound();

  const [{ data: building }, { data: flat }, { data: payments }] = await Promise.all([
    supabase.from("bms_buildings").select("name, address, city").eq("id", buildingId).single(),
    supabase
      .from("bms_flats")
      .select("flat_number, floor, block")
      .eq("id", invoice.flat_id)
      .single(),
    supabase.from("bms_payments").select("amount").eq("invoice_id", id),
  ]);

  const { data: resident } = await supabase
    .from("bms_residents")
    .select("full_name, phone")
    .eq("flat_id", invoice.flat_id)
    .eq("building_id", buildingId)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();

  const amount = Number(invoice.amount);
  const paid = (payments ?? []).reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const balance = Math.max(0, amount - paid);
  const status = invoice.status === "waived" ? "Waived" : balance <= 0 ? "Paid" : paid > 0 ? "Partial" : "Unpaid";
  const monthLabel = formatMonthLabel(String(invoice.billing_month).slice(0, 7));
  const location = [
    flat?.floor != null ? `Floor ${flat.floor}` : null,
    flat?.block ? `Block ${flat.block}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const statusColor =
    status === "Paid"
      ? "bg-emerald-100 text-emerald-700"
      : status === "Partial"
        ? "bg-blue-100 text-blue-700"
        : status === "Waived"
          ? "bg-slate-100 text-slate-600"
          : "bg-rose-100 text-rose-700";

  return (
    <div className="min-h-screen bg-secondary/30 py-8">
      <div className="max-w-3xl mx-auto px-4">
        <div className="no-print mb-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">Invoice {invoice.invoice_number}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {building?.name ?? "Building"} · {flat?.flat_number ?? "—"} · {monthLabel}
            </p>
          </div>
          <PrintReceiptButton />
        </div>

        <div
          id="print-area"
          className="rounded-xl shadow-lg overflow-hidden bg-white text-slate-900"
        >
          {/* Brand stripe */}
          <div className="h-1.5 bg-amber" />

          <div className="p-8 sm:p-10">
            {/* Header */}
            <div className="flex items-start justify-between gap-6 flex-wrap">
              <div>
                <h2 className="text-xl font-bold tracking-tight">{building?.name ?? "Building"}</h2>
                {(building?.address || building?.city) && (
                  <p className="text-sm text-slate-500 mt-1">
                    {[building?.address, building?.city].filter(Boolean).join(", ")}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                  Maintenance Invoice
                </p>
                <p className="mt-1 font-mono text-sm text-slate-700">{invoice.invoice_number}</p>
                <span
                  className={`mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColor}`}
                >
                  {status}
                </span>
              </div>
            </div>

            {/* Bill to + meta */}
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                  Bill to
                </p>
                <p className="mt-1.5 text-base font-semibold">Flat {flat?.flat_number ?? "—"}</p>
                {location && <p className="text-sm text-slate-500">{location}</p>}
                {resident?.full_name && (
                  <p className="text-sm text-slate-700 mt-1">{resident.full_name}</p>
                )}
                {resident?.phone && (
                  <p className="text-sm text-slate-500 tabular-nums">{formatPhone(resident.phone)}</p>
                )}
              </div>
              <div className="sm:text-right">
                <div className="text-sm">
                  <span className="text-slate-400">Billing month</span>
                  <p className="font-medium">{monthLabel}</p>
                </div>
                <div className="text-sm mt-3">
                  <span className="text-slate-400">Due date</span>
                  <p className="font-medium">
                    {invoice.due_date ? formatDate(invoice.due_date) : "—"}
                  </p>
                </div>
              </div>
            </div>

            {/* Line items */}
            <table className="w-full mt-8 text-sm">
              <thead>
                <tr className="border-b-2 border-slate-200 text-left">
                  <th className="py-2 font-semibold text-slate-500">Description</th>
                  <th className="py-2 font-semibold text-slate-500 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-100">
                  <td className="py-3">Maintenance charge — {monthLabel}</td>
                  <td className="py-3 text-right tabular-nums">{formatCurrency(amount)}</td>
                </tr>
              </tbody>
            </table>

            {/* Totals */}
            <div className="mt-4 flex justify-end">
              <div className="w-full sm:w-72 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Total</span>
                  <span className="tabular-nums">{formatCurrency(amount)}</span>
                </div>
                {paid > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Received</span>
                    <span className="tabular-nums">− {formatCurrency(paid)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t-2 border-slate-200 pt-2 mt-1 text-base font-bold">
                  <span>Balance due</span>
                  <span className="tabular-nums">{formatCurrency(balance)}</span>
                </div>
              </div>
            </div>

            <p className="mt-6 text-xs text-slate-500">
              {amountInWords(balance)}.
            </p>

            <p className="mt-8 text-center text-xs text-slate-400">
              {balance > 0
                ? `Please clear the balance by ${invoice.due_date ? formatDate(invoice.due_date) : "the due date"}.`
                : "This invoice has been settled. Thank you."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
