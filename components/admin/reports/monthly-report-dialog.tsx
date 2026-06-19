"use client";

import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { getMonthlyReportData, type SectionKey } from "@/app/actions/monthly-report";

type Section = { key: SectionKey; label: string };

const SECTIONS: Section[] = [
  { key: "collections", label: "Collections" },
  { key: "expenses",    label: "Operating Expenses" },
  { key: "bills",       label: "Utility Bills" },
  { key: "salaries",    label: "Staff Salaries" },
  { key: "projects",    label: "Projects" },
];

function pkMonth(offset = 0) {
  // Compute year/month in PK timezone (UTC+5) then apply `offset` months.
  const pkNow = new Date(Date.now() + 5 * 60 * 60 * 1000);
  const y   = pkNow.getUTCFullYear();
  const mo  = pkNow.getUTCMonth() + offset;   // may be <0 or >11 — Date handles rollover
  const base = new Date(Date.UTC(y, mo, 1));
  const from = base.toISOString().slice(0, 10);
  const to   = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0))
    .toISOString()
    .slice(0, 10);
  return { from, to };
}

type Props = {
  open: boolean;
  onClose: () => void;
};

export function MonthlyReportDialog({ open, onClose }: Props) {
  const thisMonth = pkMonth(0);
  const lastMonth = pkMonth(-1);

  const [from,     setFrom]     = useState(thisMonth.from);
  const [to,       setTo]       = useState(thisMonth.to);
  const [sections, setSections] = useState<SectionKey[]>(SECTIONS.map((s) => s.key));
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const toggleSection = (key: SectionKey) =>
    setSections((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );

  const setPreset = (preset: { from: string; to: string }) => {
    setFrom(preset.from);
    setTo(preset.to);
    setError(null);
  };

  const generate = async () => {
    if (!from || !to) { setError("Please set both From and To dates."); return; }
    if (from > to)    { setError("From date must be before To date.");   return; }
    if (sections.length === 0) { setError("Select at least one section."); return; }
    setError(null);
    setLoading(true);
    try {
      const { data, error: fetchError } = await getMonthlyReportData({ from, to, sections });
      if (fetchError || !data) { setError(fetchError ?? "Failed to load data."); return; }
      const { downloadMonthlyReportPdf } = await import("@/lib/reports/monthly-report-pdf");
      await downloadMonthlyReportPdf(data);
    } catch (e) {
      setError("Something went wrong. Please try again.");
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Monthly Financial Report</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Period */}
          <div className="space-y-3">
            <p className="text-sm font-semibold">Period</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPreset(thisMonth)}
                className={`px-4 py-1.5 rounded-full text-sm border transition-colors ${
                  from === thisMonth.from && to === thisMonth.to
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:bg-muted"
                }`}
              >
                This month
              </button>
              <button
                type="button"
                onClick={() => setPreset(lastMonth)}
                className={`px-4 py-1.5 rounded-full text-sm border transition-colors ${
                  from === lastMonth.from && to === lastMonth.to
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:bg-muted"
                }`}
              >
                Last month
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">From</Label>
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => { setFrom(e.target.value); setError(null); }}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">To</Label>
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => { setTo(e.target.value); setError(null); }}
                />
              </div>
            </div>
          </div>

          {/* Sections */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Include Sections</p>
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() =>
                  setSections(
                    sections.length === SECTIONS.length ? [] : SECTIONS.map((s) => s.key),
                  )
                }
              >
                {sections.length === SECTIONS.length ? "Deselect all" : "Select all"}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {SECTIONS.map(({ key, label }) => (
                <label
                  key={key}
                  className="flex items-center gap-2.5 cursor-pointer select-none group"
                >
                  <input
                    type="checkbox"
                    checked={sections.includes(key)}
                    onChange={() => toggleSection(key)}
                    className="w-4 h-4 rounded border-border accent-primary cursor-pointer"
                  />
                  <span className="text-sm group-hover:text-foreground transition-colors">
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={generate} disabled={loading || sections.length === 0}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <FileDown className="w-4 h-4 mr-2" />
                Generate PDF
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
