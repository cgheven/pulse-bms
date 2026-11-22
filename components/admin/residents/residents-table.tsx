"use client";

import Link from "next/link";
import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";
import {
  Plus,
  Search,
  KeyRound,
  UserX,
  Pencil,
  Trash2,
  Download,
  FileSpreadsheet,
  FileText,
} from "lucide-react";
import { cn, capitalize, formatDate, formatPhone, formatCNIC } from "@/lib/utils";
import type { ReportColumn } from "@/lib/reports/types";
import { downloadReportXlsx } from "@/lib/reports/xlsx-export";
import { downloadReportPdf } from "@/lib/reports/pdf-export";
import {
  ResidentFormDialog,
  type FlatOption,
} from "./resident-form-dialog";
import { ResidentLoginDialog } from "./resident-login-dialog";
import { revokeResidentLogin, deleteResident } from "@/app/actions/residents";

export type ResidentRow = {
  id: string;
  flat_id: string;
  flat_number: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  cnic: string | null;
  relationship: "owner" | "tenant" | "family";
  is_primary: boolean;
  is_active: boolean;
  move_in_date: string | null;
  move_out_date: string | null;
  entry_fee_paid: number;
  profile_id: string | null;
};

// Column set shared by the Excel and PDF exporters so both stay identical to
// what's on screen.
const EXPORT_COLUMNS: ReportColumn<ResidentRow>[] = [
  { id: "name", label: "Name", defaultOn: true, accessor: (r) => r.full_name, widthMm: 45 },
  { id: "flat", label: "Flat", defaultOn: true, accessor: (r) => r.flat_number, widthMm: 20 },
  { id: "role", label: "Role", defaultOn: true, accessor: (r) => capitalize(r.relationship), widthMm: 22 },
  { id: "phone", label: "Phone", defaultOn: true, accessor: (r) => (r.phone ? formatPhone(r.phone) : ""), widthMm: 40 },
  { id: "email", label: "Email", defaultOn: true, accessor: (r) => r.email ?? "", widthMm: 50 },
  { id: "cnic", label: "CNIC", defaultOn: true, accessor: (r) => (r.cnic ? formatCNIC(r.cnic) : ""), widthMm: 42 },
  { id: "movein", label: "Move-in", defaultOn: true, accessor: (r) => (r.move_in_date ? formatDate(r.move_in_date) : ""), widthMm: 28 },
  { id: "status", label: "Status", defaultOn: true, accessor: (r) => (r.is_active ? "Active" : "Inactive"), widthMm: 24 },
];

export function ResidentsTable({
  residents,
  flats,
  buildingDefaults,
  buildingName,
}: {
  residents: ResidentRow[];
  flats: FlatOption[];
  buildingDefaults: { entry_fee_owner: number; entry_fee_tenant: number };
  buildingName: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [flatFilter, setFlatFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);

  // Login dialog state — adaptive between create and reset modes
  const [loginTarget, setLoginTarget] = useState<{
    resident: ResidentRow;
    mode: "create" | "reset";
  } | null>(null);

  // Edit dialog
  const [editTarget, setEditTarget] = useState<ResidentRow | null>(null);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<ResidentRow | null>(null);
  const [deleting, startDelete] = useTransition();

  // Revoke confirm
  const [revokeTarget, setRevokeTarget] = useState<ResidentRow | null>(null);
  const [revoking, startRevoke] = useTransition();

  // Flats that actually have a resident, so the dropdown never offers an empty
  // option. Sorted the way flat numbers read (A-1, A-2, A-10 → numeric-aware).
  const flatOptions = useMemo(
    () =>
      Array.from(new Set(residents.map((r) => r.flat_number).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b, undefined, { numeric: true }),
      ),
    [residents],
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return residents.filter((r) => {
      if (
        s &&
        !(
          r.full_name.toLowerCase().includes(s) ||
          r.flat_number.toLowerCase().includes(s) ||
          (r.phone ?? "").toLowerCase().includes(s) ||
          (r.cnic ?? "").toLowerCase().includes(s)
        )
      )
        return false;
      if (flatFilter !== "all" && r.flat_number !== flatFilter) return false;
      if (roleFilter !== "all" && r.relationship !== roleFilter) return false;
      return true;
    });
  }, [residents, q, flatFilter, roleFilter]);

  const hasFilters = flatFilter !== "all" || roleFilter !== "all" || q.trim() !== "";
  const clearFilters = () => {
    setQ("");
    setFlatFilter("all");
    setRoleFilter("all");
  };

  // Exports always reflect the filtered view on screen, not the full table.
  const exportFilename = `residents-${new Date().toISOString().slice(0, 10)}`;
  const activeFiltersLine = () => {
    const parts: string[] = [];
    if (flatFilter !== "all") parts.push(`Flat: ${flatFilter}`);
    if (roleFilter !== "all") parts.push(`Role: ${capitalize(roleFilter)}`);
    if (q.trim()) parts.push(`Search: "${q.trim()}"`);
    return parts.length ? parts.join("  ·  ") : undefined;
  };

  const handleExportExcel = async () => {
    try {
      await downloadReportXlsx({
        filename: exportFilename,
        sheetName: "Residents",
        columns: EXPORT_COLUMNS,
        rows: filtered,
      });
    } catch (err) {
      toast({
        title: "Could not export to Excel",
        description: friendlyErrorMessage(err),
        variant: "destructive",
      });
    }
  };

  const handleExportPdf = async () => {
    try {
      await downloadReportPdf({
        meta: {
          title: "Residents",
          buildingName,
          period: `As of ${formatDate(new Date())}`,
          filtersLine: activeFiltersLine(),
          filename: exportFilename,
        },
        columns: EXPORT_COLUMNS,
        rows: filtered,
        totalsRow: false,
      });
    } catch (err) {
      toast({
        title: "Could not export to PDF",
        description: friendlyErrorMessage(err),
        variant: "destructive",
      });
    }
  };

  function handleDelete() {
    if (!deleteTarget) return;
    startDelete(async () => {
      try {
        await deleteResident(deleteTarget.id);
        toast({ title: "Resident deleted", description: `${deleteTarget.full_name} has been removed.` });
        setDeleteTarget(null);
        router.refresh();
      } catch (err) {
        toast({
          title: "Could not delete resident",
          description: friendlyErrorMessage(err),
          variant: "destructive",
        });
      }
    });
  }

  function handleRevoke() {
    if (!revokeTarget) return;
    startRevoke(async () => {
      try {
        await revokeResidentLogin(revokeTarget.id);
        toast({ title: "Login revoked", description: `${revokeTarget.full_name} can no longer sign in.` });
        setRevokeTarget(null);
        router.refresh();
      } catch (err) {
        toast({
          title: "Could not revoke login",
          description: friendlyErrorMessage(err),
          variant: "destructive",
        });
      }
    });
  }

  // Row action buttons — shared by the desktop table and the mobile cards so
  // both stay in sync. Labels collapse to icons on narrow screens.
  function renderActions(r: ResidentRow) {
    const hasLogin = Boolean(r.profile_id);
    return (
      <div className="flex items-center justify-end gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs gap-1 text-primary hover:text-primary hover:bg-primary/10"
          onClick={() =>
            setLoginTarget({ resident: r, mode: hasLogin ? "reset" : "create" })
          }
          title={hasLogin ? "Reset password" : "Create login"}
        >
          <KeyRound className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{hasLogin ? "Reset PW" : "Add Login"}</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-8 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10",
            !hasLogin && "invisible pointer-events-none",
          )}
          onClick={() => setRevokeTarget(r)}
          title="Revoke login access"
        >
          <UserX className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Revoke</span>
        </Button>
        <div className="w-px h-4 bg-border mx-0.5" />
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs gap-1 text-muted-foreground hover:text-foreground"
          onClick={() => setEditTarget(r)}
          title="Edit resident"
        >
          <Pencil className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Edit</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => setDeleteTarget(r)}
          title="Delete resident"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Delete</span>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar — search, filters and the add action share one full-width row */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name / flat / phone / CNIC..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-10 pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <Select value={flatFilter} onValueChange={setFlatFilter}>
            <SelectTrigger
              className="h-10 flex-1 min-w-[7.5rem] lg:flex-none lg:w-[9rem]"
              aria-label="Filter by flat"
            >
              <SelectValue placeholder="Flat" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All flats</SelectItem>
              {flatOptions.map((fn) => (
                <SelectItem key={fn} value={fn}>
                  {fn}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger
              className="h-10 flex-1 min-w-[7.5rem] lg:flex-none lg:w-[8.5rem]"
              aria-label="Filter by role"
            >
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="owner">Owner</SelectItem>
              <SelectItem value="tenant">Tenant</SelectItem>
              <SelectItem value="family">Family</SelectItem>
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-10 text-xs text-muted-foreground shrink-0"
            >
              Clear
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2 lg:ml-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="h-10 flex-1 gap-2 lg:flex-none"
                disabled={filtered.length === 0}
              >
                <Download className="w-4 h-4" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={handleExportExcel} className="gap-2">
                <FileSpreadsheet className="w-4 h-4 text-[hsl(151_70%_55%)]" />
                Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportPdf} className="gap-2">
                <FileText className="w-4 h-4 text-destructive" />
                PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            className="btn-big flex-1 lg:flex-none"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="w-5 h-5" />
            Add Resident
          </Button>
        </div>
        <ResidentFormDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          flats={flats}
          buildingDefaults={buildingDefaults}
        />
      </div>

      {/* Live count */}
      <div className="flex items-center justify-end text-xs text-muted-foreground">
        <span className="tabular-nums">
          {filtered.length} of {residents.length}
        </span>
      </div>

      {/* Mobile card list — the table is too wide for a phone */}
      <div className="space-y-2 sm:hidden">
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-border bg-card px-3 py-10 text-center text-sm text-muted-foreground">
            No residents found.
          </div>
        ) : (
          filtered.map((r) => (
            <div key={r.id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    href={`/admin/residents/${r.id}`}
                    prefetch
                    className="text-base font-semibold text-primary hover:underline"
                  >
                    {r.full_name}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    <Link
                      href={`/admin/flats/${r.flat_id}`}
                      className="text-primary/90 hover:underline tabular-nums"
                    >
                      {r.flat_number}
                    </Link>
                    <span className="mx-1 text-muted-foreground/40">·</span>
                    <span className="capitalize">{r.relationship}</span>
                  </p>
                </div>
                {r.is_active ? (
                  <span className="status-paid inline-flex shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider">
                    Active
                  </span>
                ) : (
                  <span className="status-pending inline-flex shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider">
                    Inactive
                  </span>
                )}
              </div>

              {(r.phone || r.cnic) && (
                <p className="mt-2 text-xs text-muted-foreground tabular-nums">
                  {r.phone ? formatPhone(r.phone) : "—"}
                  {r.cnic && (
                    <>
                      <span className="mx-1 text-muted-foreground/40">·</span>
                      {formatCNIC(r.cnic)}
                    </>
                  )}
                </p>
              )}

              <div className="mt-2.5 flex items-center justify-end border-t border-border/60 pt-2">
                {renderActions(r)}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block card-soft p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 border-b border-border">
              <tr className="text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Flat</th>
                <th className="px-4 py-2.5">Role</th>
                <th className="px-4 py-2.5">Phone</th>
                <th className="px-4 py-2.5">CNIC</th>
                <th className="px-4 py-2.5">Move-in</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                    No residents found.
                  </td>
                </tr>
              )}
              {filtered.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-border last:border-0 hover:bg-secondary/50"
                  >
                    <td className="px-4 py-2.5 font-semibold whitespace-nowrap">
                      <Link
                        href={`/admin/residents/${r.id}`}
                        prefetch
                        className="text-primary hover:underline"
                      >
                        {r.full_name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <Link
                        href={`/admin/flats/${r.flat_id}`}
                        className="text-primary hover:underline tabular-nums"
                      >
                        {r.flat_number}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 capitalize">{r.relationship}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">{r.phone ? formatPhone(r.phone) : "—"}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">{r.cnic ? formatCNIC(r.cnic) : "—"}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">
                      {r.move_in_date ? formatDate(r.move_in_date) : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      {r.is_active ? (
                        <span className="status-paid inline-flex px-2 py-0.5 rounded-full text-xs font-medium">
                          Active
                        </span>
                      ) : (
                        <span className="status-pending inline-flex px-2 py-0.5 rounded-full text-xs font-medium">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">{renderActions(r)}</td>
                  </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit dialog */}
      {editTarget && (
        <ResidentFormDialog
          open={Boolean(editTarget)}
          onOpenChange={(open) => { if (!open) setEditTarget(null); }}
          flats={flats}
          buildingDefaults={buildingDefaults}
          initial={{
            id: editTarget.id,
            flat_id: editTarget.flat_id,
            full_name: editTarget.full_name,
            phone: editTarget.phone ?? "",
            email: editTarget.email ?? "",
            cnic: editTarget.cnic ?? "",
            relationship: (editTarget.relationship as "owner" | "tenant" | "family") ?? "owner",
            is_primary: editTarget.is_primary,
            is_active: editTarget.is_active,
            move_in_date: editTarget.move_in_date ?? "",
            move_out_date: editTarget.move_out_date ?? "",
            entry_fee_paid: editTarget.entry_fee_paid,
          }}
        />
      )}

      <ResidentLoginDialog
        open={Boolean(loginTarget)}
        onClose={() => setLoginTarget(null)}
        mode={loginTarget?.mode ?? "create"}
        resident={
          loginTarget
            ? {
                id: loginTarget.resident.id,
                full_name: loginTarget.resident.full_name,
                phone: loginTarget.resident.phone,
                email: loginTarget.resident.email,
                flat_number: loginTarget.resident.flat_number,
              }
            : null
        }
        buildingName={buildingName}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.full_name}?`}
        description="This permanently removes the resident and all their data. This cannot be undone."
        confirmLabel={deleting ? "Deleting…" : "Delete resident"}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(revokeTarget)}
        title={`Revoke login for ${revokeTarget?.full_name}?`}
        description="They will no longer be able to sign in. Their resident record and history are kept — you can re-issue a login later."
        confirmLabel={revoking ? "Revoking…" : "Revoke login"}
        onConfirm={handleRevoke}
        onCancel={() => setRevokeTarget(null)}
      />
    </div>
  );
}
