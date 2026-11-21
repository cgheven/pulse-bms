"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, User, Home, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { ComplaintActions } from "@/components/admin/facility/complaint-actions";
import type { ComplaintStatus } from "@/app/actions/facility";

/* ── pill / label maps (complaint subset) ─────────────────────────────── */

const STATUS_PILL: Record<string, string> = {
  open: "status-pending",
  assigned: "status-info",
  in_progress: "status-info",
  resolved: "status-paid",
  closed: "status-paid",
};
const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  assigned: "Assigned",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

const PRIORITY_PILL: Record<string, string> = {
  low: "bg-secondary text-muted-foreground border border-border",
  normal: "status-info",
  high: "status-pending",
  urgent: "status-overdue",
};
const PRIORITY_LABEL: Record<string, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

const CATEGORY_LABELS: Record<string, string> = {
  pest: "Pest Control",
  pest_control: "Pest Control",
  lift_service: "Lift Service",
  lift: "Lift",
  generator: "Generator",
  painting: "Painting",
  plumbing: "Plumbing",
  electrical: "Electrical",
  electricity: "Electricity",
  cleaning: "Cleaning",
  cleanliness: "Cleanliness",
  security: "Security",
  garden: "Garden / Landscape",
  water: "Water",
  water_tank: "Water Tank",
  noise: "Noise",
  fire_safety: "Fire Safety",
  other: "Other",
};

function prettifyCategory(s: string | null | undefined): string {
  if (!s) return "—";
  if (CATEGORY_LABELS[s]) return CATEGORY_LABELS[s];
  return s
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/* ── row shape (pre-flattened by the server component) ────────────────── */

export type ComplaintRow = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  priority: string;
  status: string;
  resolution: string | null;
  assigned_to: string | null;
  created_at: string | null;
  residentName: string | null;
  flatNumber: string | null;
};

export function ComplaintsTable({
  rows,
  staff,
}: {
  rows: ComplaintRow[];
  staff: { id: string; full_name: string }[];
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [category, setCategory] = useState("all");

  // Distinct categories present in the data (so the dropdown only lists
  // what actually exists for this building).
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.category) set.add(r.category);
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "all") {
        if (status === "open" && !["open", "assigned", "in_progress"].includes(r.status))
          return false;
        if (status !== "open" && r.status !== status) return false;
      }
      if (priority !== "all" && r.priority !== priority) return false;
      if (category !== "all" && r.category !== category) return false;
      if (q) {
        const hay = [
          r.title,
          r.description,
          r.residentName,
          r.flatNumber ? `flat ${r.flatNumber}` : null,
          r.category ? prettifyCategory(r.category) : null,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, status, priority, category]);

  const hasFilters =
    search.trim() !== "" || status !== "all" || priority !== "all" || category !== "all";

  function clearFilters() {
    setSearch("");
    setStatus("all");
    setPriority("all");
    setCategory("all");
  }

  return (
    <div className="space-y-3">
      {/* ── Filter bar ── */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, resident, flat..."
            className="pl-9"
          />
        </div>

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="open">Open (unresolved)</SelectItem>
            <SelectItem value="assigned">Assigned</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>

        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>

        {categories.length > 0 && (
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {prettifyCategory(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="gap-1 text-muted-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
        )}

        <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground tabular-nums">
          {filtered.length} of {rows.length}
        </span>
      </div>

      {/* ── Table ── */}
      <div className="rounded-xl border border-border bg-card shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary border-b border-border">
              <tr className="text-left">
                <th className="px-4 py-3 font-semibold">Complaint</th>
                <th className="px-4 py-3 font-semibold">Raised By</th>
                <th className="px-4 py-3 font-semibold">Priority</th>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Manage</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                    {rows.length === 0
                      ? "No complaints filed."
                      : "No complaints match the filters."}
                  </td>
                </tr>
              )}
              {filtered.map((c) => {
                const priorityVal = c.priority ?? "normal";
                return (
                  <tr
                    key={c.id}
                    className="border-b border-border last:border-0 hover:bg-secondary/40 align-top"
                  >
                    {/* Complaint cell */}
                    <td className="px-4 py-3 min-w-[220px] max-w-xs">
                      <div className="font-semibold text-foreground leading-snug">{c.title}</div>
                      {c.description && (
                        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {c.description}
                        </div>
                      )}
                      {c.category && (
                        <span className="inline-flex mt-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-secondary border border-border text-muted-foreground">
                          {prettifyCategory(c.category)}
                        </span>
                      )}
                      {c.resolution && (
                        <div className="mt-2 text-xs flex items-start gap-1.5 p-2 rounded-md bg-[hsl(151_70%_32%/0.1)] border border-[hsl(151_70%_32%/0.25)] text-[hsl(151_70%_55%)]">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>
                            <strong className="font-semibold">Resolved:</strong> {c.resolution}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Raised by cell */}
                    <td className="px-4 py-3 min-w-[140px]">
                      {c.residentName || c.flatNumber ? (
                        <div className="space-y-0.5">
                          {c.residentName && (
                            <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                              <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              {c.residentName}
                            </div>
                          )}
                          {c.flatNumber && (
                            <div className="flex items-center gap-1.5 text-xs text-primary font-semibold">
                              <Home className="w-3 h-3 text-primary/70 shrink-0" />
                              Flat {c.flatNumber}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Anonymous</span>
                      )}
                    </td>

                    {/* Priority */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                          PRIORITY_PILL[priorityVal] ?? PRIORITY_PILL.normal
                        }`}
                      >
                        {PRIORITY_LABEL[priorityVal] ?? priorityVal}
                      </span>
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                      {c.created_at ? formatDate(c.created_at) : "—"}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          STATUS_PILL[c.status ?? "open"] ?? STATUS_PILL.open
                        }`}
                      >
                        {STATUS_LABEL[c.status ?? "open"] ?? c.status}
                      </span>
                    </td>

                    {/* Manage */}
                    <td className="px-4 py-3">
                      <ComplaintActions
                        complaintId={c.id}
                        currentStatus={(c.status ?? "open") as ComplaintStatus}
                        currentAssignee={c.assigned_to}
                        staff={staff}
                      />
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
