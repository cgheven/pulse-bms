import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn, formatCurrency, formatDate, capitalize } from "@/lib/utils";
import { KpiRowSkeleton, TableSkeleton } from "@/components/layout/table-skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DuesPill } from "@/components/resident/dues-pill";
import { STAFF_ROLE_LABELS, type StaffRole } from "@/types";
import {
  TrendingUp,
  TrendingDown,
  Users,
  Scale,
  Wallet,
  AlertTriangle,
  EyeOff,
  UserCog,
  Receipt,
  FileText,
  CheckCircle2,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ResidentTransparencyPage() {
  const { profile } = await requireRole("resident");

  if (!profile.building_id) {
    return (
      <div className="card-soft">
        <h1>Where your money goes</h1>
        <p className="text-sm text-muted-foreground mt-2">
          No building assigned to your account.
        </p>
      </div>
    );
  }

  const buildingId = profile.building_id;
  const today = new Date();
  const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1)
    .toISOString()
    .slice(0, 10);
  const monthLabel = new Date(`${monthStart}T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-5 animate-fade-up max-w-5xl">
      <header>
        <h1>Where your money goes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Building accounts for {monthLabel}.
        </p>
      </header>

      <Suspense fallback={<HeroSkeleton />}>
        <FundHero buildingId={buildingId} />
      </Suspense>

      <Suspense fallback={<MonthGridSkeleton />}>
        <ThisMonth
          buildingId={buildingId}
          monthStart={monthStart}
          nextMonthStart={nextMonthStart}
        />
      </Suspense>

      <Suspense fallback={<TableSkeleton rows={3} />}>
        <DefaultersSection buildingId={buildingId} />
      </Suspense>

      <LedgerTabs
        buildingId={buildingId}
        monthStart={monthStart}
        nextMonthStart={nextMonthStart}
      />
    </div>
  );
}

/* ─────────────  Tabbed ledger: Staff / Bills / Expenses  ───────────── */

function LedgerTabs({
  buildingId,
  monthStart,
  nextMonthStart,
}: {
  buildingId: string;
  monthStart: string;
  nextMonthStart: string;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold tracking-tight">Building ledger</h2>
      <Tabs defaultValue="staff">
        <TabsList>
          <TabsTrigger value="staff">
            <UserCog className="w-3.5 h-3.5" />
            Staff
          </TabsTrigger>
          <TabsTrigger value="bills">
            <FileText className="w-3.5 h-3.5" />
            Maintenance
          </TabsTrigger>
          <TabsTrigger value="expenses">
            <Receipt className="w-3.5 h-3.5" />
            Expenses
          </TabsTrigger>
        </TabsList>

        <TabsContent value="staff">
          <Suspense fallback={<TableSkeleton rows={4} />}>
            <StaffPanel
              buildingId={buildingId}
              monthStart={monthStart}
              nextMonthStart={nextMonthStart}
            />
          </Suspense>
        </TabsContent>

        <TabsContent value="bills">
          <Suspense fallback={<TableSkeleton rows={5} />}>
            <BillsPanel buildingId={buildingId} monthStart={monthStart} />
          </Suspense>
        </TabsContent>

        <TabsContent value="expenses">
          <Suspense fallback={<TableSkeleton rows={6} />}>
            <ExpensesPanel buildingId={buildingId} />
          </Suspense>
        </TabsContent>
      </Tabs>
    </section>
  );
}

async function StaffPanel({
  buildingId,
  monthStart,
  nextMonthStart,
}: {
  buildingId: string;
  monthStart: string;
  nextMonthStart: string;
}) {
  const supabase = await createClient();
  const [{ data: staff }, { data: salaries }] = await Promise.all([
    supabase
      .from("bms_staff")
      .select("id, full_name, role, monthly_salary, join_date")
      .eq("building_id", buildingId)
      .eq("is_active", true)
      .order("monthly_salary", { ascending: false }),
    supabase
      .from("bms_salary_payments")
      .select("staff_id, amount")
      .eq("building_id", buildingId)
      .gte("payment_date", monthStart)
      .lt("payment_date", nextMonthStart),
  ]);

  type StaffRow = {
    id: string;
    full_name: string;
    role: string;
    monthly_salary: number | null;
    join_date: string | null;
  };
  const rows = (staff ?? []) as StaffRow[];

  const paidThisMonth = new Map<string, number>();
  for (const s of salaries ?? []) {
    if (!s.staff_id) continue;
    paidThisMonth.set(
      s.staff_id,
      (paidThisMonth.get(s.staff_id) ?? 0) + Number(s.amount ?? 0),
    );
  }

  const totalPayroll = rows.reduce(
    (s, r) => s + Number(r.monthly_salary ?? 0),
    0,
  );
  const totalPaidThisMonth = Array.from(paidThisMonth.values()).reduce(
    (s, v) => s + v,
    0,
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        No active staff.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <MiniKpi
          label="Monthly payroll"
          value={formatCurrency(totalPayroll)}
          icon={<Users className="w-3.5 h-3.5" />}
        />
        <MiniKpi
          label="Paid this month"
          value={formatCurrency(totalPaidThisMonth)}
          icon={<CheckCircle2 className="w-3.5 h-3.5" />}
          tone="success"
        />
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Role</th>
              <th className="px-4 py-2.5 font-medium tabular-nums">Since</th>
              <th className="px-4 py-2.5 font-medium text-right">Monthly salary</th>
              <th className="px-4 py-2.5 font-medium">This month</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const paid = paidThisMonth.get(s.id) ?? 0;
              const owed = Number(s.monthly_salary ?? 0);
              const isPaid = paid >= owed && owed > 0;
              return (
                <tr key={s.id} className="border-t border-border hover:bg-secondary/40">
                  <td className="px-4 py-3 font-medium">{s.full_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {STAFF_ROLE_LABELS[s.role as StaffRole] ?? capitalize(s.role)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">
                    {s.join_date ? formatDate(s.join_date) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">
                    {formatCurrency(owed)}
                  </td>
                  <td className="px-4 py-3">
                    {isPaid ? (
                      <span className="inline-flex items-center rounded-full border border-[hsl(151_70%_55%/0.30)] bg-[hsl(151_70%_55%/0.12)] text-[hsl(151_70%_55%)] px-2 py-0.5 text-[11px] font-medium">
                        Cleared ✓
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-destructive/30 bg-destructive/15 text-destructive px-2 py-0.5 text-[11px] font-medium tabular-nums">
                        {formatCurrency(Math.max(0, owed - paid))} still due
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function BillsPanel({
  buildingId,
  monthStart,
}: {
  buildingId: string;
  monthStart: string;
}) {
  const supabase = await createClient();

  // Privacy: bills always show by flat number. The Union name-toggle that gates
  // defaulter names is honored here too so the same policy applies consistently.
  const [
    { data: building },
    { data: invoices },
    { data: flats },
  ] = await Promise.all([
    supabase
      .from("bms_buildings")
      .select("expose_defaulter_names")
      .eq("id", buildingId)
      .maybeSingle(),
    supabase
      .from("bms_invoices")
      .select("id, flat_id, amount, status, due_date")
      .eq("building_id", buildingId)
      .eq("billing_month", monthStart)
      .order("flat_id", { ascending: true }),
    supabase
      .from("bms_flats")
      .select("id, flat_number")
      .eq("building_id", buildingId),
  ]);

  // Paid totals per invoice — used by the amount-aware status pill so a
  // resident who paid Rs. 500 of a Rs. 5,000 bill shows "Rs. 4,500 still due"
  // instead of the jargon-y "partial".
  const paidByInvoice = new Map<string, number>();
  const invoiceIds = (invoices ?? []).map((i) => i.id);
  if (invoiceIds.length > 0) {
    const { data: pays } = await supabase
      .from("bms_payments")
      .select("invoice_id, amount")
      .in("invoice_id", invoiceIds);
    for (const p of pays ?? []) {
      if (!p.invoice_id) continue;
      paidByInvoice.set(
        p.invoice_id,
        (paidByInvoice.get(p.invoice_id) ?? 0) + Number(p.amount ?? 0),
      );
    }
  }

  const exposeNames = Boolean(building?.expose_defaulter_names);
  type InvRow = {
    id: string;
    flat_id: string | null;
    amount: number;
    status: string | null;
    due_date: string | null;
  };
  const rows = (invoices ?? []) as InvRow[];
  const flatNumberById = new Map(
    (flats ?? []).map((f) => [f.id, f.flat_number]),
  );

  // Resident name lookup only when Union has opened the curtain.
  const nameByFlat = new Map<string, string>();
  if (exposeNames && rows.length > 0) {
    const flatIds = Array.from(
      new Set(rows.map((r) => r.flat_id).filter(Boolean) as string[]),
    );
    if (flatIds.length > 0) {
      const { data: residents } = await supabase
        .from("bms_residents")
        .select("flat_id, full_name, is_primary, is_active")
        .in("flat_id", flatIds)
        .eq("is_active", true);
      for (const r of residents ?? []) {
        if (!r.flat_id) continue;
        if (!nameByFlat.has(r.flat_id) || r.is_primary) {
          nameByFlat.set(r.flat_id, r.full_name);
        }
      }
    }
  }

  const totalBilled = rows
    .filter((r) => r.status !== "waived")
    .reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const paidCount = rows.filter((r) => r.status === "paid").length;

  // Flats that owe for the current month — unpaid = anything not paid or waived.
  // Sorted by flat number for predictable scanning.
  const unpaidFlatNumbers = rows
    .filter((r) => r.status !== "paid" && r.status !== "waived" && r.flat_id)
    .map((r) => flatNumberById.get(r.flat_id as string))
    .filter((n): n is string => !!n)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  // Sort table: unpaid first (pending/overdue/partial), then paid, then waived.
  // Within each group, by flat number for stable order.
  const STATUS_ORDER: Record<string, number> = {
    overdue: 0,
    pending: 1,
    partial: 2,
    paid: 3,
    waived: 4,
  };
  const sortedRows = [...rows].sort((a, b) => {
    const ao = STATUS_ORDER[a.status ?? "pending"] ?? 1;
    const bo = STATUS_ORDER[b.status ?? "pending"] ?? 1;
    if (ao !== bo) return ao - bo;
    const an = a.flat_id ? flatNumberById.get(a.flat_id) ?? "" : "";
    const bn = b.flat_id ? flatNumberById.get(b.flat_id) ?? "" : "";
    return an.localeCompare(bn, undefined, { numeric: true });
  });

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        No maintenance invoices generated for this month yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <MiniKpi
          label="Total maintenance"
          value={formatCurrency(totalBilled)}
          icon={<FileText className="w-3.5 h-3.5" />}
        />
        <MiniKpi
          label="Collected"
          value={`${paidCount} / ${rows.length}`}
          icon={<CheckCircle2 className="w-3.5 h-3.5" />}
          tone={paidCount === rows.length ? "success" : "neutral"}
        />
      </div>

      {unpaidFlatNumbers.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-destructive mb-2">
            <AlertTriangle className="w-3.5 h-3.5" />
            Unpaid this month · {unpaidFlatNumbers.length}{" "}
            {unpaidFlatNumbers.length === 1 ? "flat" : "flats"}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {unpaidFlatNumbers.map((n) => (
              <span
                key={n}
                className="inline-flex items-center px-2 py-0.5 rounded-md border border-destructive/30 bg-card text-[11px] font-medium tabular-nums text-destructive"
              >
                {n}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Flat</th>
              {exposeNames && <th className="px-4 py-2.5 font-medium">Resident</th>}
              <th className="px-4 py-2.5 font-medium text-right">Amount</th>
              <th className="px-4 py-2.5 font-medium">Due</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r) => (
              <tr key={r.id} className="border-t border-border hover:bg-secondary/40">
                <td className="px-4 py-3 font-medium tabular-nums whitespace-nowrap">
                  {r.flat_id ? `Flat ${flatNumberById.get(r.flat_id) ?? "—"}` : "—"}
                </td>
                {exposeNames && (
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.flat_id ? nameByFlat.get(r.flat_id) ?? "—" : "—"}
                  </td>
                )}
                <td className="px-4 py-3 text-right tabular-nums font-medium">
                  {formatCurrency(Number(r.amount))}
                </td>
                <td className="px-4 py-3 text-muted-foreground tabular-nums">
                  {r.due_date ? formatDate(r.due_date) : "—"}
                </td>
                <td className="px-4 py-3">
                  <DuesPill
                    status={r.status}
                    amount={Number(r.amount)}
                    paidTotal={paidByInvoice.get(r.id) ?? 0}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!exposeNames && (
          <div className="px-4 py-2 border-t border-border bg-secondary/30 text-[11px] text-muted-foreground flex items-center gap-1.5">
            <EyeOff className="w-3 h-3" />
            Names hidden by Union policy. Listed by flat number only.
          </div>
        )}
      </div>
    </div>
  );
}

async function ExpensesPanel({ buildingId }: { buildingId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bms_expenses")
    .select("expense_date, category, subcategory, description, amount, vendor")
    .eq("building_id", buildingId)
    .order("expense_date", { ascending: false })
    .limit(30);

  type ExpenseRow = {
    expense_date: string | null;
    category: string;
    subcategory: string | null;
    description: string;
    amount: number;
    vendor: string | null;
  };
  const recent = (data ?? []) as ExpenseRow[];
  const total30 = recent.reduce((s, e) => s + Number(e.amount ?? 0), 0);

  if (recent.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        No expenses recorded yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <MiniKpi
        label={`Total · last ${recent.length}`}
        value={formatCurrency(total30)}
        icon={<Receipt className="w-3.5 h-3.5" />}
        tone="danger"
      />

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Date</th>
              <th className="px-4 py-2.5 font-medium">Category</th>
              <th className="px-4 py-2.5 font-medium">Description</th>
              <th className="px-4 py-2.5 font-medium">Vendor</th>
              <th className="px-4 py-2.5 font-medium text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((e, i) => (
              <tr key={i} className="border-t border-border hover:bg-secondary/40">
                <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                  {e.expense_date ? formatDate(e.expense_date) : "—"}
                </td>
                <td className="px-4 py-3 capitalize text-muted-foreground">
                  {capitalize(e.category)}
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium">{e.description}</div>
                  {e.subcategory && (
                    <div className="text-[11px] text-muted-foreground">{e.subcategory}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{e.vendor ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">
                  {formatCurrency(Number(e.amount))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MiniKpi({
  label,
  value,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "neutral" | "success" | "danger";
}) {
  const color =
    tone === "success"
      ? "text-[hsl(151_70%_55%)]"
      : tone === "danger"
        ? "text-destructive"
        : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <span className={color}>{icon}</span>
        {label}
      </div>
      <div className={cn("mt-1 text-lg sm:text-xl font-semibold tabular-nums", color)}>
        {value}
      </div>
    </div>
  );
}

/* ─────────────  1. Fund balance hero  ───────────── */

async function FundHero({ buildingId }: { buildingId: string }) {
  const supabase = await createClient();

  // bms_buildings.fund_balance is the OPENING balance. Live balance =
  // opening + lifetime payments − lifetime expenses − lifetime salaries.
  // Matches admin dashboard math (app/(admin)/admin/page.tsx PnLHero).
  const [
    { data: building },
    { data: allPayments },
    { data: allExpenses },
    { data: allSalaries },
  ] = await Promise.all([
    supabase
      .from("bms_buildings")
      .select("name, fund_balance")
      .eq("id", buildingId)
      .maybeSingle(),
    supabase
      .from("bms_payments")
      .select("amount")
      .eq("building_id", buildingId),
    supabase
      .from("bms_expenses")
      .select("amount")
      .eq("building_id", buildingId),
    supabase
      .from("bms_salary_payments")
      .select("amount")
      .eq("building_id", buildingId),
  ]);

  const sum = (rows: { amount: number | string | null }[] | null) =>
    (rows ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);

  const fundBalance =
    Number(building?.fund_balance ?? 0) +
    sum(allPayments ?? null) -
    sum(allExpenses ?? null) -
    sum(allSalaries ?? null);

  return (
    <div className="rounded-xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card p-5 sm:p-6 glow-amber">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <Wallet className="w-3.5 h-3.5 text-primary" />
            Building fund balance
          </div>
          <div className="mt-1.5 text-3xl sm:text-4xl font-bold tracking-tight tabular-nums text-primary">
            {formatCurrency(fundBalance)}
          </div>
          <div className="text-xs text-muted-foreground mt-1.5">
            Total cash held by {building?.name ?? "the building"}.
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6 animate-fade-in">
      <div className="h-3 w-32 rounded bg-secondary/50 animate-pulse" />
      <div className="mt-2 h-10 w-48 rounded bg-secondary/60 animate-pulse" />
      <div className="mt-2 h-3 w-40 rounded bg-secondary/40 animate-pulse" />
    </div>
  );
}

/* ─────────────  2-6. This month + outstanding  ───────────── */

async function ThisMonth({
  buildingId,
  monthStart,
  nextMonthStart,
}: {
  buildingId: string;
  monthStart: string;
  nextMonthStart: string;
}) {
  const supabase = await createClient();

  const [
    { data: monthPayments },
    { data: monthExpenses },
    { data: monthSalaries },
    { data: flats },
  ] = await Promise.all([
    supabase
      .from("bms_payments")
      .select("amount")
      .eq("building_id", buildingId)
      .gte("payment_date", monthStart)
      .lt("payment_date", nextMonthStart),
    supabase
      .from("bms_expenses")
      .select("amount")
      .eq("building_id", buildingId)
      .gte("expense_date", monthStart)
      .lt("expense_date", nextMonthStart),
    supabase
      .from("bms_salary_payments")
      .select("amount")
      .eq("building_id", buildingId)
      .gte("payment_date", monthStart)
      .lt("payment_date", nextMonthStart),
    supabase
      .from("bms_flats")
      .select("outstanding_dues")
      .eq("building_id", buildingId),
  ]);

  const sum = (rows: { amount: number | string | null }[] | null) =>
    (rows ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);

  const income = sum(monthPayments ?? null);
  const expense = sum(monthExpenses ?? null);
  const salaries = sum(monthSalaries ?? null);
  const remaining = income - expense - salaries;
  const outstandingMaintenance = (flats ?? []).reduce(
    (s, f) => s + Number(f.outstanding_dues ?? 0),
    0,
  );

  const remainingTone: "success" | "danger" =
    remaining >= 0 ? "success" : "danger";

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold tracking-tight">This month</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          label="Income"
          value={formatCurrency(income)}
          icon={<TrendingUp className="w-3.5 h-3.5" />}
          tone="success"
        />
        <Kpi
          label="Expenses"
          value={formatCurrency(expense)}
          icon={<TrendingDown className="w-3.5 h-3.5" />}
          tone="danger"
          hint="excludes staff salaries"
        />
        <Kpi
          label="Staff salaries"
          value={formatCurrency(salaries)}
          icon={<Users className="w-3.5 h-3.5" />}
          tone="danger"
        />
        <Kpi
          label="Net remaining"
          value={formatCurrency(remaining)}
          icon={<Scale className="w-3.5 h-3.5" />}
          tone={remainingTone}
          hint="income − expenses − salaries"
        />
      </div>

      <div className="rounded-lg border border-border bg-card p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex w-9 h-9 items-center justify-center rounded-md bg-destructive/10 text-destructive shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Remaining maintenance
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 truncate">
              Total dues still pending from all flats.
            </div>
          </div>
        </div>
        <div
          className={cn(
            "text-2xl sm:text-3xl font-bold tracking-tight tabular-nums shrink-0",
            outstandingMaintenance > 0 ? "text-destructive" : "text-foreground",
          )}
        >
          {formatCurrency(outstandingMaintenance)}
        </div>
      </div>
    </section>
  );
}

function MonthGridSkeleton() {
  return (
    <section className="space-y-3 animate-fade-in">
      <div className="h-4 w-24 rounded bg-secondary/50 animate-pulse" />
      <KpiRowSkeleton count={4} />
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="h-3 w-32 rounded bg-secondary/50 animate-pulse" />
        <div className="mt-2 h-7 w-36 rounded bg-secondary/40 animate-pulse" />
      </div>
    </section>
  );
}

/* ─────────────  Defaulters (privacy-aware, unchanged behavior)  ───────────── */

async function DefaultersSection({ buildingId }: { buildingId: string }) {
  const supabase = await createClient();

  const [{ data: building }, { data: outstandingInvoices }, { data: flats }] =
    await Promise.all([
      supabase
        .from("bms_buildings")
        .select("utility_cutoff_after_months, expose_defaulter_names")
        .eq("id", buildingId)
        .maybeSingle(),
      supabase
        .from("bms_invoices")
        .select("flat_id, billing_month")
        .eq("building_id", buildingId)
        .in("status", ["pending", "partial", "overdue"]),
      supabase
        .from("bms_flats")
        .select("id, flat_number, outstanding_dues")
        .eq("building_id", buildingId),
    ]);

  const cutoff = Number(building?.utility_cutoff_after_months ?? 3);
  const exposeNames = Boolean(building?.expose_defaulter_names);

  const monthsByFlat = new Map<string, Set<string>>();
  for (const inv of outstandingInvoices ?? []) {
    if (!inv.flat_id || !inv.billing_month) continue;
    const m = String(inv.billing_month).slice(0, 7);
    if (!monthsByFlat.has(inv.flat_id)) monthsByFlat.set(inv.flat_id, new Set());
    monthsByFlat.get(inv.flat_id)!.add(m);
  }
  const flatMap = new Map((flats ?? []).map((f) => [f.id, f]));
  type DefaulterRow = {
    flat_id: string;
    flat_number: string;
    months_unpaid: number;
    outstanding: number;
    resident_name: string | null;
  };
  const defaulters: DefaulterRow[] = [];
  const defaulterFlatIds: string[] = [];
  for (const [flatId, months] of monthsByFlat.entries()) {
    if (months.size < cutoff) continue;
    const f = flatMap.get(flatId);
    if (!f) continue;
    defaulters.push({
      flat_id: flatId,
      flat_number: f.flat_number,
      months_unpaid: months.size,
      outstanding: Number(f.outstanding_dues ?? 0),
      resident_name: null,
    });
    defaulterFlatIds.push(flatId);
  }

  if (exposeNames && defaulterFlatIds.length > 0) {
    const { data: residents } = await supabase
      .from("bms_residents")
      .select("flat_id, full_name, is_primary, is_active")
      .in("flat_id", defaulterFlatIds)
      .eq("is_active", true);
    const nameByFlat = new Map<string, string>();
    for (const r of residents ?? []) {
      if (!r.flat_id) continue;
      if (!nameByFlat.has(r.flat_id) || r.is_primary) {
        nameByFlat.set(r.flat_id, r.full_name);
      }
    }
    for (const d of defaulters) {
      d.resident_name = nameByFlat.get(d.flat_id) ?? null;
    }
  }
  defaulters.sort((a, b) => b.months_unpaid - a.months_unpaid);
  const totalDefaulterDues = defaulters.reduce((s, d) => s + d.outstanding, 0);

  return (
    <section>
      <div className="flex items-end justify-between flex-wrap gap-2 mb-2">
        <div>
          <h2 className="text-base font-semibold tracking-tight flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            Defaulters
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Flats {cutoff}+ months unpaid · total {formatCurrency(totalDefaulterDues)} pending.
          </p>
        </div>
        {!exposeNames && defaulters.length > 0 && (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground bg-secondary border border-border px-2 py-0.5 rounded-full">
            <EyeOff className="w-3 h-3" />
            Names hidden by Union
          </span>
        )}
      </div>

      {defaulters.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          No flats are currently in default. Nicely done.
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Flat</th>
                {exposeNames && <th className="px-4 py-2.5 font-medium">Resident</th>}
                <th className="px-4 py-2.5 font-medium text-right">Months</th>
                <th className="px-4 py-2.5 font-medium text-right">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {defaulters.map((d) => (
                <tr key={d.flat_id} className="border-t border-border hover:bg-secondary/40">
                  <td className="px-4 py-3 font-medium tabular-nums whitespace-nowrap">
                    Flat {d.flat_number}
                  </td>
                  {exposeNames && (
                    <td className="px-4 py-3 text-muted-foreground">
                      {d.resident_name ?? "—"}
                    </td>
                  )}
                  <td className="px-4 py-3 text-right tabular-nums">{d.months_unpaid}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-destructive">
                    {formatCurrency(d.outstanding)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ─────────────  Shared KPI tile  ───────────── */

function Kpi({
  label,
  value,
  icon,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "neutral" | "success" | "danger";
  hint?: string;
}) {
  const color =
    tone === "success"
      ? "text-[hsl(151_70%_55%)]"
      : tone === "danger"
        ? "text-destructive"
        : "text-foreground";
  const borderL =
    tone === "success"
      ? "border-l-[hsl(151_70%_55%)]"
      : tone === "danger"
        ? "border-l-destructive"
        : "border-l-primary";
  return (
    <div
      className={cn(
        "rounded-lg border border-border border-l-2 bg-card p-3 sm:p-4",
        borderL,
      )}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <span className={color}>{icon}</span>
        {label}
      </div>
      <div className={cn("mt-1 text-xl sm:text-2xl font-semibold tabular-nums truncate", color)}>
        {value}
      </div>
      {hint && (
        <div className="text-[10px] text-muted-foreground mt-1 truncate">
          {hint}
        </div>
      )}
    </div>
  );
}
