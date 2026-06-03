"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { CheckCircle, ChevronDown, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";
import {
  verifyUtilityAccount,
  deleteUtilityAccount,
  updatePaymentStatus,
  type UtilityType,
  type UtilityAccountRow,
} from "@/app/actions/utilities";
import { AddEditDialog } from "@/components/admin/utilities/add-edit-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface Props {
  types: UtilityType[];
  accounts: UtilityAccountRow[];
  flats: { id: string; flat_number: string; floor: number | null }[];
  buildingName: string;
}

const STATUS_CONFIG = {
  paid:    { label: "Paid",    dot: "bg-emerald-500", pill: "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 border-emerald-200/60" },
  unpaid:  { label: "Unpaid",  dot: "bg-red-500",     pill: "bg-red-500/10 text-red-700 hover:bg-red-500/20 border-red-200/60" },
  unknown: { label: "Unknown", dot: "bg-zinc-400",    pill: "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 border-zinc-200" },
} as const;

const STATUS_OPTIONS = ["paid", "unpaid", "unknown"] as const;

function PaymentStatusPill({
  status,
  loading,
  onChange,
}: {
  status: "paid" | "unpaid" | "unknown";
  loading: boolean;
  onChange: (s: "paid" | "unpaid" | "unknown") => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  const current = STATUS_CONFIG[status];

  return (
    <div ref={ref} className="relative inline-block">
      <button
        disabled={loading}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${current.pill}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${current.dot}`} />
        {loading ? "Saving…" : current.label}
        <ChevronDown className={`w-3 h-3 opacity-50 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && !loading && (
        <div className="absolute left-0 top-full mt-1.5 z-50 bg-popover border border-border rounded-lg shadow-md py-1 min-w-[112px]">
          {STATUS_OPTIONS.map((opt) => {
            const c = STATUS_CONFIG[opt];
            const active = status === opt;
            return (
              <button
                key={opt}
                onClick={() => { onChange(opt); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-secondary ${active ? "font-semibold" : "font-normal text-muted-foreground"}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.dot}`} />
                {c.label}
                {active && <span className="ml-auto text-[10px] opacity-60">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function UtilitiesClient({ types, accounts, flats, buildingName }: Props) {
  const { toast } = useToast();

  const [activeFilter, setActiveFilter] = useState<"all" | string>("all");
  const [searchFlat, setSearchFlat] = useState("");

  const [addEditOpen, setAddEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<UtilityAccountRow | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteLoading, startDeleteTransition] = useTransition();

  // Per-row verify transitions tracked by row id
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [, startVerifyTransition] = useTransition();

  // Per-row payment status transitions
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [, startStatusTransition] = useTransition();

  // --- Computed ---
  const filteredAccounts = accounts.filter((a) => {
    const matchesType =
      activeFilter === "all" || a.utility_type_id === activeFilter;
    const matchesSearch =
      searchFlat.trim() === "" ||
      a.flat_number.toLowerCase().includes(searchFlat.trim().toLowerCase());
    return matchesType && matchesSearch;
  });

  // --- Export helpers ---
  function handlePDF() {
    const rows = filteredAccounts
      .map((a) => {
        const status =
          a.submitted_by_resident && !a.is_verified
            ? "Pending Review"
            : a.is_verified
            ? "Verified"
            : "Added by Admin";
        const paymentLabel =
          a.payment_status === "paid"
            ? "Paid"
            : a.payment_status === "unpaid"
            ? "Unpaid"
            : "Unknown";
        return `<tr>
          <td>${a.flat_number}</td>
          <td>${a.floor != null ? a.floor : "—"}</td>
          <td>${a.utility_name}${a.utility_code ? ` (${a.utility_code})` : ""}</td>
          <td class="mono">${a.account_number}</td>
          <td>${a.account_holder_name ?? "—"}</td>
          <td>${status}</td>
          <td>${paymentLabel}</td>
        </tr>`;
      })
      .join("");

    const now = new Date();
    const timestamp = now.toLocaleDateString("en-PK", {
      day: "2-digit", month: "short", year: "numeric",
    }) + ", " + now.toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" });

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Utility Bill Numbers</title>
  <style>
    /* @page margin:0 suppresses the browser's auto date/URL/page-number headers */
    @page { margin: 0; size: A4 portrait; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    /* Body padding compensates — we own the full layout */
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 12px;
      color: #111;
      padding: 18mm 20mm 14mm 20mm;
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }
    header { margin-bottom: 18px; padding-bottom: 10px; border-bottom: 2px solid #111; }
    header h1 { font-size: 20px; font-weight: 700; }
    header h2 { font-size: 12px; font-weight: 400; color: #555; margin-top: 3px; }
    main { flex: 1; }
    table { width: 100%; border-collapse: collapse; }
    thead th {
      background: #f3f4f6;
      font-size: 10px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.06em;
      padding: 6px 8px; text-align: left;
      border-top: 1px solid #d1d5db; border-bottom: 1px solid #d1d5db;
    }
    tbody td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: middle; }
    tbody tr:last-child td { border-bottom: none; }
    .mono { font-family: "Courier New", monospace; font-size: 11px; }
    footer { margin-top: 16px; font-size: 10px; color: #999; }
  </style>
</head>
<body>
  <header>
    <h1>${buildingName || "Building"}</h1>
    <h2>Utility Bill Numbers</h2>
  </header>
  <main>
    <table>
      <thead>
        <tr>
          <th>Flat No.</th>
          <th>Floor</th>
          <th>Utility</th>
          <th>Account Number</th>
          <th>Account Holder</th>
          <th>Status</th>
          <th>Payment</th>
        </tr>
      </thead>
      <tbody>${rows.length ? rows : '<tr><td colspan="7" style="text-align:center;color:#aaa;padding:16px">No records</td></tr>'}</tbody>
    </table>
  </main>
  <footer>${timestamp}</footer>
</body>
</html>`;

    // Use a hidden iframe — no new tab opens; print dialog appears over the current page
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;left:-9999px;width:0;height:0;border:0;opacity:0";
    iframe.src = url;
    document.body.appendChild(iframe);
    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      // Clean up after the dialog closes (small delay so Safari can finish)
      setTimeout(() => {
        document.body.removeChild(iframe);
        URL.revokeObjectURL(url);
      }, 1000);
    };
  }

  function handleCSV() {
    const header = ["Flat No", "Floor", "Utility", "Account Number", "Account Holder", "Status", "Payment"];
    const rows = filteredAccounts.map((a) => {
      const status =
        a.submitted_by_resident && !a.is_verified
          ? "Pending Review"
          : a.is_verified
          ? "Verified"
          : "Added by Admin";
      const payment =
        a.payment_status === "paid"
          ? "Paid"
          : a.payment_status === "unpaid"
          ? "Unpaid"
          : "Unknown";
      return [
        a.flat_number,
        a.floor != null ? String(a.floor) : "",
        a.utility_name,
        a.account_number,
        a.account_holder_name ?? "",
        status,
        payment,
      ];
    });

    const csvContent = [header, ...rows]
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "utility-accounts.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  // --- Handlers ---
  function handleEdit(account: UtilityAccountRow) {
    setEditTarget(account);
    setAddEditOpen(true);
  }

  function handleAdd() {
    setEditTarget(null);
    setAddEditOpen(true);
  }

  function handleVerifyToggle(account: UtilityAccountRow) {
    setVerifyingId(account.id);
    startVerifyTransition(async () => {
      try {
        await verifyUtilityAccount(account.id, !account.is_verified);
        toast({
          title: account.is_verified ? "Unverified" : "Verified",
          description: `Account for Flat ${account.flat_number} marked as ${account.is_verified ? "unverified" : "verified"}.`,
        });
      } catch (err) {
        toast({
          title: "Error",
          description: friendlyErrorMessage(err),
          variant: "destructive",
        });
      } finally {
        setVerifyingId(null);
      }
    });
  }

  function handlePaymentStatusChange(
    accountId: string,
    newStatus: "paid" | "unpaid" | "unknown",
    flatNumber: string,
  ) {
    setUpdatingStatusId(accountId);
    startStatusTransition(async () => {
      try {
        await updatePaymentStatus(accountId, newStatus);
        toast({
          title: "Status updated",
          description: `Flat ${flatNumber} marked as ${newStatus}.`,
        });
      } catch (err) {
        toast({
          title: "Error",
          description: friendlyErrorMessage(err),
          variant: "destructive",
        });
      } finally {
        setUpdatingStatusId(null);
      }
    });
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    const id = deleteTarget;
    startDeleteTransition(async () => {
      try {
        await deleteUtilityAccount(id);
        toast({ title: "Deleted", description: "Utility account removed." });
      } catch (err) {
        toast({
          title: "Error",
          description: friendlyErrorMessage(err),
          variant: "destructive",
        });
      } finally {
        setDeleteTarget(null);
      }
    });
  }

  return (
    <>
      {/* Top Bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="text"
          value={searchFlat}
          onChange={(e) => setSearchFlat(e.target.value)}
          placeholder="Search flat number..."
          className="h-9 text-sm border border-border rounded-lg px-3 w-44 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="flex flex-wrap gap-2 ml-auto">
          <Button className="btn-big" onClick={handleAdd}>
            Add Account
          </Button>
          <Button
            variant="outline"
            className="h-9 text-sm"
            onClick={handlePDF}
          >
            Download PDF
          </Button>
          <Button
            variant="outline"
            className="h-9 text-sm"
            onClick={handleCSV}
          >
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filter Pills */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setActiveFilter("all")}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            activeFilter === "all"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
          }`}
        >
          All
        </button>
        {types.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveFilter(t.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              activeFilter === t.id
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            {t.name}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card-soft p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary border-b border-border">
              <tr className="text-left">
                <th className="px-4 py-3 font-semibold">Flat No.</th>
                <th className="px-4 py-3 font-semibold">Floor</th>
                <th className="px-4 py-3 font-semibold">Utility</th>
                <th className="px-4 py-3 font-semibold">Account Number</th>
                <th className="px-4 py-3 font-semibold">Account Holder</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Payment</th>
                <th className="px-4 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    No utility accounts yet. Click Add Account to get started.
                  </td>
                </tr>
              ) : (
                filteredAccounts.map((account) => {
                  const isPendingReview =
                    account.submitted_by_resident && !account.is_verified;
                  const isVerified = account.is_verified;

                  return (
                    <tr
                      key={account.id}
                      className="border-b border-border last:border-0 hover:bg-secondary/50"
                    >
                      <td className="px-4 py-3 font-medium whitespace-nowrap">
                        {account.flat_number}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {account.floor != null ? account.floor : "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {account.utility_name}
                        {account.utility_code && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({account.utility_code})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono whitespace-nowrap">
                        {account.account_number}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {account.account_holder_name ?? "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {isPendingReview ? (
                          <span className="status-pending">Pending Review</span>
                        ) : isVerified ? (
                          <span className="status-paid">Verified</span>
                        ) : (
                          <span className="status-pending">Added by Admin</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <PaymentStatusPill
                          status={account.payment_status}
                          loading={updatingStatusId === account.id}
                          onChange={(s) => handlePaymentStatusChange(account.id, s, account.flat_number)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            title={account.is_verified ? "Unverify" : "Verify"}
                            disabled={verifyingId === account.id}
                            onClick={() => handleVerifyToggle(account)}
                            className={`h-8 w-8 flex items-center justify-center rounded-lg transition-colors disabled:opacity-50 ${
                              account.is_verified
                                ? "text-green-600 hover:bg-green-50"
                                : "text-muted-foreground hover:bg-secondary"
                            }`}
                          >
                            <CheckCircle className="h-4 w-4" />
                          </button>
                          <button
                            title="Edit"
                            onClick={() => handleEdit(account)}
                            className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary transition-colors"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            title="Delete"
                            onClick={() => setDeleteTarget(account.id)}
                            className="h-8 w-8 flex items-center justify-center rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Dialog */}
      <AddEditDialog
        mode={editTarget ? "edit" : "add"}
        initial={editTarget}
        types={types}
        flats={flats}
        open={addEditOpen}
        onOpenChange={(open) => {
          setAddEditOpen(open);
          if (!open) setEditTarget(null);
        }}
      />

      {/* Manage Types Dialog */}
      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Utility Account"
        description="This will remove the utility account from the building records. This action cannot be undone."
        confirmLabel={deleteLoading ? "Deleting..." : "Delete"}
        loading={deleteLoading}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
