import Image from "next/image";
import { UserRound, Phone } from "lucide-react";
import { formatPhone, formatCNIC } from "@/lib/utils";

export type DirectoryRow = {
  id: string;
  full_name: string;
  phone: string | null;
  cnic: string | null;
  status: string;
  has_photo: boolean;
  resident_name: string;
  flat_number: string;
};

export function DriversDirectory({ rows }: { rows: DirectoryRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
        <UserRound className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">
          No drivers recorded yet. Residents add their drivers from their portal.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-secondary/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 font-medium">Driver</th>
            <th className="px-4 py-2.5 font-medium">Phone</th>
            <th className="px-4 py-2.5 font-medium">CNIC</th>
            <th className="px-4 py-2.5 font-medium">Flat</th>
            <th className="px-4 py-2.5 font-medium">Resident</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id} className="border-t border-border hover:bg-secondary/40">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2.5">
                  {d.has_photo ? (
                    <Image
                      src={`/api/driver-photo/${d.id}`}
                      alt={d.full_name}
                      width={36}
                      height={36}
                      unoptimized
                      className="w-9 h-9 rounded-lg object-cover border border-border shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                      <UserRound className="w-4 h-4 text-muted-foreground/60" />
                    </div>
                  )}
                  <span className="font-medium text-foreground">{d.full_name}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                {d.phone ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5" />
                    {formatPhone(d.phone)}
                  </span>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-4 py-3 text-muted-foreground tabular-nums whitespace-nowrap">
                {d.cnic ? formatCNIC(d.cnic) : "—"}
              </td>
              <td className="px-4 py-3 text-muted-foreground">{d.flat_number}</td>
              <td className="px-4 py-3 text-muted-foreground">{d.resident_name}</td>
              <td className="px-4 py-3">
                <StatusPill left={d.status === "left"} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusPill({ left }: { left: boolean }) {
  const cls = left
    ? "bg-destructive/15 text-destructive border-destructive/30"
    : "bg-[hsl(151_70%_55%/0.12)] text-[hsl(151_70%_55%)] border-[hsl(151_70%_55%/0.30)]";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${cls}`}
    >
      {left ? "Left" : "Active"}
    </span>
  );
}
