"use client";

import Link from "next/link";
import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Star, KeyRound, UserX } from "lucide-react";
import { cn, formatDate, formatPhone, formatCNIC } from "@/lib/utils";
import {
  ResidentFormDialog,
  type FlatOption,
} from "./resident-form-dialog";
import { ResidentLoginDialog } from "./resident-login-dialog";
import { revokeResidentLogin } from "@/app/actions/residents";

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
  profile_id: string | null;
};

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
  const [addOpen, setAddOpen] = useState(false);

  // Login dialog state — adaptive between create and reset modes
  const [loginTarget, setLoginTarget] = useState<{
    resident: ResidentRow;
    mode: "create" | "reset";
  } | null>(null);

  // Revoke confirm
  const [revokeTarget, setRevokeTarget] = useState<ResidentRow | null>(null);
  const [revoking, startRevoke] = useTransition();

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return residents;
    return residents.filter(
      (r) =>
        r.full_name.toLowerCase().includes(s) ||
        r.flat_number.toLowerCase().includes(s) ||
        (r.phone ?? "").toLowerCase().includes(s) ||
        (r.cnic ?? "").toLowerCase().includes(s),
    );
  }, [residents, q]);

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
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <Input
          placeholder="Search by name / flat / phone / CNIC..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="sm:max-w-md"
        />
        <Button className="btn-big shrink-0" onClick={() => setAddOpen(true)}>
          <Plus className="w-5 h-5" />
          Add Resident
        </Button>
        <ResidentFormDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          flats={flats}
          buildingDefaults={buildingDefaults}
        />
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Star className="w-3 h-3 text-warning fill-warning" />
        <span>= Main contact for the flat</span>
      </div>

      <div className="card-soft p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary border-b border-border">
              <tr className="text-left">
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Flat</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Phone</th>
                <th className="px-4 py-3 font-semibold">CNIC</th>
                <th className="px-4 py-3 font-semibold">Move-in</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Login</th>
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
              {filtered.map((r) => {
                const hasLogin = Boolean(r.profile_id);
                return (
                  <tr
                    key={r.id}
                    className="border-b border-border last:border-0 hover:bg-secondary/50"
                  >
                    <td className="px-4 py-3 font-semibold">
                      <Link
                        href={`/admin/residents/${r.id}`}
                        className="text-primary hover:underline"
                      >
                        {r.full_name}
                      </Link>
                      {r.is_primary && (
                        <span
                          title="Main contact for this flat"
                          aria-label="Primary contact"
                        >
                          <Star className="inline-block w-3.5 h-3.5 ml-1.5 -mt-0.5 text-warning fill-warning" />
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link
                        href={`/admin/flats/${r.flat_id}`}
                        className="text-primary hover:underline tabular-nums"
                      >
                        {r.flat_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 capitalize">{r.relationship}</td>
                    <td className="px-4 py-3">{r.phone ? formatPhone(r.phone) : "—"}</td>
                    <td className="px-4 py-3">{r.cnic ? formatCNIC(r.cnic) : "—"}</td>
                    <td className="px-4 py-3">
                      {r.move_in_date ? formatDate(r.move_in_date) : "—"}
                    </td>
                    <td className="px-4 py-3">
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
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {/* Adaptive primary action — same slot, label flips */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs gap-1 text-primary hover:text-primary hover:bg-primary/10"
                          onClick={() =>
                            setLoginTarget({
                              resident: r,
                              mode: hasLogin ? "reset" : "create",
                            })
                          }
                          title={hasLogin ? "Reset password" : "Create login"}
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">
                            {hasLogin ? "Reset PW" : "Add Login"}
                          </span>
                        </Button>
                        {/* Revoke — invisible (not hidden) so column width stays consistent */}
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
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

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
