"use client";

import { useMemo, useState, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { ReportShell } from "@/components/admin/reports/report-shell";
import { useColumnPicker } from "@/components/admin/reports/column-picker";
import { useReportDateRange } from "@/lib/reports/use-report-date-range";
import { formatDate } from "@/lib/utils";
import { PAYMENT_MODE } from "@/types";
import type { DateRange, ReportColumn } from "@/lib/reports/types";

const MODE_LABEL: Record<string, string> = {
  [PAYMENT_MODE.CASH]: "Cash",
  [PAYMENT_MODE.BANK]: "Bank transfer",
  [PAYMENT_MODE.ONLINE]: "Online",
  [PAYMENT_MODE.CHEQUE]: "Cheque",
  [PAYMENT_MODE.CREDIT_CARRYFORWARD]: "Credit carry-forward",
};

type Row = {
  id: string;
  payment_date: string;
  amount: number;
  payment_mode: string;
  receipt_no: string | null;
  flat_number: string;
  resident_name: string | null;
  received_by_name: string | null;
  received_by_position: string | null;
  bank_account_name: string;
  project_id: string;
  project_name: string;
};

type ProjectOption = {
  id: string;
  name: string;
  status: "active" | "closed" | "cancelled";
};

export function ProjectsReportClient({
  buildingName,
  initialDateRange,
  initialProjectFilter,
  rows,
  projects,
}: {
  buildingName: string;
  initialDateRange: DateRange;
  initialProjectFilter: string;
  rows: Row[];
  projects: ProjectOption[];
}) {
  const [dateRange, setDateRange] = useReportDateRange(initialDateRange);

  // Project filter is URL-driven so the server refetches with .eq(project_id, ...)
  // and the resulting payload stays small even on buildings with many projects.
  const router = useRouter();
  const pathname = usePathname();
  const [projectFilter, setProjectFilterState] =
    useState<string>(initialProjectFilter);

  const setProjectFilter = useCallback(
    (next: string) => {
      setProjectFilterState(next);
      const sp = new URLSearchParams();
      sp.set("from", dateRange.from);
      sp.set("to", dateRange.to);
      if (next && next !== "all") sp.set("project", next);
      router.push(`${pathname}?${sp.toString()}`, { scroll: false });
    },
    [pathname, router, dateRange],
  );

  const filtered = useMemo(() => {
    // Server already filters by date + project. Client-side filter is just
    // a defensive guard in case the URL drifts out of sync with state.
    return rows.filter((r) => {
      if (r.payment_date < dateRange.from) return false;
      if (r.payment_date > dateRange.to) return false;
      if (projectFilter && projectFilter !== "all" && r.project_id !== projectFilter)
        return false;
      return true;
    });
  }, [rows, dateRange, projectFilter]);

  const columns: ReportColumn<Row>[] = useMemo(
    () => [
      {
        id: "date",
        label: "Date",
        defaultOn: true,
        accessor: (r) => formatDate(r.payment_date),
      },
      {
        id: "project",
        label: "Project",
        defaultOn: true,
        accessor: (r) => r.project_name,
      },
      {
        id: "flat",
        label: "Flat",
        defaultOn: true,
        accessor: (r) => r.flat_number,
      },
      {
        id: "resident",
        label: "Resident",
        defaultOn: true,
        accessor: (r) => r.resident_name ?? "—",
      },
      {
        id: "amount",
        label: "Amount",
        defaultOn: true,
        numeric: true,
        accessor: (r) => r.amount,
      },
      {
        id: "mode",
        label: "Mode",
        defaultOn: true,
        accessor: (r) => MODE_LABEL[r.payment_mode] ?? r.payment_mode,
      },
      {
        id: "bank",
        label: "Bank account",
        defaultOn: true,
        accessor: (r) => r.bank_account_name,
      },
      {
        id: "receiver",
        label: "Receiver",
        defaultOn: true,
        accessor: (r) =>
          r.received_by_name && r.received_by_position
            ? `${r.received_by_name} (${r.received_by_position})`
            : r.received_by_name ?? "—",
      },
      {
        id: "receipt",
        label: "Receipt #",
        defaultOn: true,
        accessor: (r) => r.receipt_no ?? "—",
      },
    ],
    [],
  );

  const { enabledIds, visibleColumns, setColumn } = useColumnPicker(
    "projects",
    columns,
  );

  const selectedProject = projects.find((p) => p.id === projectFilter);
  const filtersLine = selectedProject
    ? `Project: ${selectedProject.name}`
    : undefined;

  const projectFilterWidget = (
    <div className="min-w-[200px]">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">
        Project
      </Label>
      <Select value={projectFilter} onValueChange={setProjectFilter}>
        <SelectTrigger>
          <SelectValue placeholder="All projects" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All projects</SelectItem>
          {projects.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
              {p.status !== "active" ? ` (${p.status})` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <ReportShell
      title="Projects report"
      subtitle="Contributions to building fundraisers — by flat, project, mode and receiver."
      buildingName={buildingName}
      reportName="projects"
      filename={`projects_${buildingName.replace(/\s+/g, "_")}`}
      dateRange={dateRange}
      setDateRange={setDateRange}
      extraFilters={projectFilterWidget}
      filtersLine={filtersLine}
      columns={columns}
      visibleColumns={visibleColumns}
      enabledIds={enabledIds}
      setColumn={setColumn}
      rows={filtered}
      emptyText="No project contributions in this period."
    />
  );
}
