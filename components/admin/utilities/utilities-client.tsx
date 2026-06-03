"use client";

import { useState, useTransition } from "react";
import { CheckCircle, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";
import {
  verifyUtilityAccount,
  deleteUtilityAccount,
  type UtilityType,
  type UtilityAccountRow,
} from "@/app/actions/utilities";
import { AddEditDialog } from "@/components/admin/utilities/add-edit-dialog";
import { ManageTypesDialog } from "@/components/admin/utilities/manage-types-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface Props {
  types: UtilityType[];
  accounts: UtilityAccountRow[];
  flats: { id: string; flat_number: string; floor: number | null }[];
}

export function UtilitiesClient({ types, accounts, flats }: Props) {
  const { toast } = useToast();

  const [activeFilter, setActiveFilter] = useState<"all" | string>("all");
  const [searchFlat, setSearchFlat] = useState("");

  const [addEditOpen, setAddEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<UtilityAccountRow | null>(null);

  const [manageTypesOpen, setManageTypesOpen] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteLoading, startDeleteTransition] = useTransition();

  // Per-row verify transitions tracked by row id
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [, startVerifyTransition] = useTransition();

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
    window.print();
  }

  function handleCSV() {
    const header = ["Flat No", "Floor", "Utility", "Account Number", "Account Holder", "Status"];
    const rows = filteredAccounts.map((a) => {
      const status =
        a.submitted_by_resident && !a.is_verified
          ? "Pending Review"
          : a.is_verified
          ? "Verified"
          : "Added by Admin";
      return [
        a.flat_number,
        a.floor != null ? String(a.floor) : "",
        a.utility_name,
        a.account_number,
        a.account_holder_name ?? "",
        status,
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
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only-table { overflow: visible !important; }
        }
      `}</style>

      {/* Top Bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4 no-print">
        <input
          type="text"
          value={searchFlat}
          onChange={(e) => setSearchFlat(e.target.value)}
          placeholder="Search flat number..."
          className="h-12 text-base border border-border rounded-lg px-3 w-48 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="flex flex-wrap gap-2 ml-auto">
          <Button className="btn-big" onClick={handleAdd}>
            Add Account
          </Button>
          <Button
            variant="outline"
            className="h-12 text-base"
            onClick={() => setManageTypesOpen(true)}
          >
            Manage Types
          </Button>
          <Button
            variant="outline"
            className="h-12 text-base"
            onClick={handlePDF}
          >
            Download PDF
          </Button>
          <Button
            variant="outline"
            className="h-12 text-base"
            onClick={handleCSV}
          >
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filter Pills */}
      <div className="flex flex-wrap gap-2 mb-4 no-print">
        <button
          onClick={() => setActiveFilter("all")}
          className={`rounded-full px-4 py-3 text-sm font-medium transition-colors ${
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
            className={`rounded-full px-4 py-3 text-sm font-medium transition-colors ${
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
      <div className="card-soft p-0 overflow-hidden print-only-table">
        <div className="overflow-x-auto">
          <table className="w-full text-base">
            <thead className="bg-secondary border-b border-border">
              <tr className="text-left">
                <th className="px-4 py-3 font-semibold">Flat No.</th>
                <th className="px-4 py-3 font-semibold">Floor</th>
                <th className="px-4 py-3 font-semibold">Utility</th>
                <th className="px-4 py-3 font-semibold">Account Number</th>
                <th className="px-4 py-3 font-semibold">Account Holder</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold no-print" />
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
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
                      <td className="px-4 py-3 no-print">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            title={account.is_verified ? "Unverify" : "Verify"}
                            disabled={verifyingId === account.id}
                            onClick={() => handleVerifyToggle(account)}
                            className={`h-14 w-14 flex items-center justify-center rounded-lg transition-colors disabled:opacity-50 ${
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
                            className="h-14 w-14 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary transition-colors"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            title="Delete"
                            onClick={() => setDeleteTarget(account.id)}
                            className="h-14 w-14 flex items-center justify-center rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
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
      <ManageTypesDialog
        types={types}
        open={manageTypesOpen}
        onOpenChange={setManageTypesOpen}
      />

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
