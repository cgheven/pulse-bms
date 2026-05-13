"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Star } from "lucide-react";
import { formatDate, formatPhone, formatCNIC } from "@/lib/utils";
import {
  ResidentFormDialog,
  type FlatOption,
} from "./resident-form-dialog";

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
};

export function ResidentsTable({
  residents,
  flats,
  buildingDefaults,
}: {
  residents: ResidentRow[];
  flats: FlatOption[];
  buildingDefaults: { entry_fee_owner: number; entry_fee_tenant: number };
}) {
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);

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
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    No residents found.
                  </td>
                </tr>
              )}
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-border last:border-0 hover:bg-secondary/50"
                >
                  <td className="px-4 py-3 font-semibold">
                    <Link href={`/admin/residents/${r.id}`} className="text-primary hover:underline">
                      {r.full_name}
                    </Link>
                    {r.is_primary && (
                      <span title="Main contact for this flat" aria-label="Primary contact">
                        <Star className="inline-block w-3.5 h-3.5 ml-1.5 -mt-0.5 text-warning fill-warning" />
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link href={`/admin/flats/${r.flat_id}`} className="text-primary hover:underline tabular-nums">
                      {r.flat_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 capitalize">{r.relationship}</td>
                  <td className="px-4 py-3">{r.phone ? formatPhone(r.phone) : "—"}</td>
                  <td className="px-4 py-3">{r.cnic ? formatCNIC(r.cnic) : "—"}</td>
                  <td className="px-4 py-3">{r.move_in_date ? formatDate(r.move_in_date) : "—"}</td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
