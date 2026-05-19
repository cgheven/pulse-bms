"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Star, Car } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { VEHICLE_TYPE_LABELS, type VehicleType } from "@/types";

export type UnionVehicleRow = {
  id: string;
  plate_number: string;
  vehicle_type: VehicleType;
  make: string | null;
  model: string | null;
  color: string | null;
  is_primary: boolean;
  flat_number: string | null;
  resident_name: string | null;
  created_at: string;
};

export function UnionVehiclesTable({
  vehicles,
  initialQuery,
}: {
  vehicles: UnionVehicleRow[];
  initialQuery: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(initialQuery);

  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      const trimmed = q.trim();
      if (trimmed) params.set("q", trimmed);
      else params.delete("q");
      const next = params.toString();
      const target = next ? `${pathname}?${next}` : pathname;
      const current = searchParams.toString();
      if (current !== next) router.replace(target, { scroll: false });
    }, 300);
    return () => clearTimeout(t);
  }, [q, pathname, router, searchParams]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <Input
          placeholder="Search by plate number..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="sm:max-w-md"
        />
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Star className="w-3 h-3 text-warning fill-warning" />
        <span>= Primary vehicle for the flat</span>
      </div>

      <div className="card-soft p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary border-b border-border">
              <tr className="text-left">
                <th className="px-4 py-3 font-semibold">Plate</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Make / Model</th>
                <th className="px-4 py-3 font-semibold">Color</th>
                <th className="px-4 py-3 font-semibold">Flat</th>
                <th className="px-4 py-3 font-semibold">Owner</th>
                <th className="px-4 py-3 font-semibold">Added</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    <Car className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    No vehicles found.
                  </td>
                </tr>
              )}
              {vehicles.map((v) => {
                const makeModel =
                  [v.make, v.model].filter(Boolean).join(" ").trim() || "—";
                return (
                  <tr
                    key={v.id}
                    className="border-b border-border last:border-0 hover:bg-secondary/50"
                  >
                    <td className="px-4 py-3 font-semibold tabular-nums tracking-wider">
                      {v.plate_number}
                      {v.is_primary && (
                        <Star className="inline-block w-3.5 h-3.5 ml-1.5 -mt-0.5 text-warning fill-warning" />
                      )}
                    </td>
                    <td className="px-4 py-3 capitalize">
                      {VEHICLE_TYPE_LABELS[v.vehicle_type]}
                    </td>
                    <td className="px-4 py-3">{makeModel}</td>
                    <td className="px-4 py-3">{v.color ?? "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                      {v.flat_number ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {v.resident_name ?? (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(v.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
