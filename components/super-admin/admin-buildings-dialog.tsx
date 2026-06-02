"use client";

import { useState, useTransition } from "react";
import { Building2, Plus, Trash2, X } from "lucide-react";
import { addAdminToBuilding, removeAdminFromBuilding } from "@/app/actions/super-admin";

interface Building {
  id: string;
  name: string;
}

interface Assignment {
  building_id: string;
  is_primary: boolean;
  building_name: string;
}

interface AdminBuildingsDialogProps {
  adminId: string;
  adminName: string;
  currentAssignments: Assignment[];
  allBuildings: Building[];
}

export function AdminBuildingsDialog({
  adminId,
  adminName,
  currentAssignments,
  allBuildings,
}: AdminBuildingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [assignments, setAssignments] = useState(currentAssignments);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedAdd, setSelectedAdd] = useState("");

  const assignedIds = new Set(assignments.map((a) => a.building_id));
  const available = allBuildings.filter((b) => !assignedIds.has(b.id));

  function handleAdd() {
    if (!selectedAdd) return;
    setError(null);
    startTransition(async () => {
      try {
        await addAdminToBuilding(adminId, selectedAdd);
        const added = allBuildings.find((b) => b.id === selectedAdd);
        if (added) {
          setAssignments((prev) => [
            ...prev,
            { building_id: added.id, is_primary: false, building_name: added.name },
          ]);
        }
        setSelectedAdd("");
      } catch (e: any) {
        setError(e.message);
      }
    });
  }

  function handleRemove(buildingId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await removeAdminFromBuilding(adminId, buildingId);
        setAssignments((prev) => prev.filter((a) => a.building_id !== buildingId));
      } catch (e: any) {
        setError(e.message);
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
      >
        <Building2 className="w-3.5 h-3.5" />
        Buildings ({assignments.length})
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative z-10 bg-card border border-border rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h2 className="text-base font-semibold">Manage Buildings</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{adminName}</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Current assignments */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Assigned Buildings
                </p>
                {assignments.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No buildings assigned</p>
                ) : (
                  <ul className="space-y-1.5">
                    {assignments.map((a) => (
                      <li
                        key={a.building_id}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-secondary/40"
                      >
                        <Building2 className="w-4 h-4 text-primary shrink-0" />
                        <span className="flex-1 text-sm text-foreground truncate">
                          {a.building_name}
                        </span>
                        {a.is_primary && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                            Primary
                          </span>
                        )}
                        <button
                          onClick={() => handleRemove(a.building_id)}
                          disabled={pending}
                          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Add building */}
              {available.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Add Building
                  </p>
                  <div className="flex gap-2">
                    <select
                      value={selectedAdd}
                      onChange={(e) => setSelectedAdd(e.target.value)}
                      className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                      <option value="">Select a building...</option>
                      {available.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleAdd}
                      disabled={!selectedAdd || pending}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      <Plus className="w-4 h-4" />
                      Add
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
