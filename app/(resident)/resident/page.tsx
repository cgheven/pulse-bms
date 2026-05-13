import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate, formatLakh } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/resident/status-pill";
import {
  ArrowRight,
  CreditCard,
  FileText,
  MessageSquare,
  Home as HomeIcon,
  PiggyBank,
  Megaphone,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

export default async function ResidentHomePage() {
  const { profile } = await requireRole("resident");
  const supabase = await createClient();

  const firstName = (profile.full_name ?? profile.email ?? "Resident").split(/\s+/)[0];

  // building
  let building: {
    id: string;
    name: string;
    fund_balance: number | null;
    address: string | null;
    city: string | null;
  } | null = null;
  if (profile.building_id) {
    const { data } = await supabase
      .from("bms_buildings")
      .select("id, name, fund_balance, address, city")
      .eq("id", profile.building_id)
      .maybeSingle();
    building = data ?? null;
  }

  // resident's flats
  const { data: residentRows } = await supabase
    .from("bms_residents")
    .select("id, flat_id, is_primary, relationship, bms_flats(id, flat_number, ownership_type, outstanding_dues, monthly_fee, floor, block)")
    .eq("profile_id", profile.id)
    .eq("is_active", true)
    .order("is_primary", { ascending: false });

  type FlatRow = {
    id: string;
    flat_number: string;
    ownership_type: "owner" | "tenant" | "vacant" | null;
    outstanding_dues: number | null;
    monthly_fee: number | null;
    floor: number | null;
    block: string | null;
  };
  type ResidentRow = {
    id: string;
    flat_id: string;
    is_primary: boolean | null;
    relationship: string | null;
    bms_flats: FlatRow | FlatRow[] | null;
  };
  const rows = (residentRows ?? []) as unknown as ResidentRow[];
  const flats: FlatRow[] = rows
    .map((r) => (Array.isArray(r.bms_flats) ? r.bms_flats[0] : r.bms_flats))
    .filter((f): f is FlatRow => !!f);
  const primaryFlat = flats[0] ?? null;

  // current month's invoice for primary flat
  const today = new Date();
  const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  let currentInvoice: {
    id: string;
    billing_month: string;
    amount: number;
    status: string | null;
    due_date: string | null;
    invoice_number: string;
  } | null = null;
  if (primaryFlat) {
    const { data } = await supabase
      .from("bms_invoices")
      .select("id, billing_month, amount, status, due_date, invoice_number")
      .eq("flat_id", primaryFlat.id)
      .eq("billing_month", monthStart)
      .maybeSingle();
    currentInvoice = data ?? null;
  }

  // recent notices (last 3)
  const { data: notices } = profile.building_id
    ? await supabase
        .from("bms_notices")
        .select("id, title, notice_type, pinned, created_at, body")
        .eq("building_id", profile.building_id)
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(3)
    : { data: [] as { id: string; title: string; notice_type: string | null; pinned: boolean | null; created_at: string; body: string }[] };

  const totalOutstanding = flats.reduce((s, f) => s + (Number(f.outstanding_dues) || 0), 0);
  const hasDues = totalOutstanding > 0;

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Greeting */}
      <div>
        <h1 className="text-4xl font-bold tracking-tight">Hello, {firstName}</h1>
        <p className="text-lg text-muted-foreground mt-2">
          Welcome to your building portal{building ? ` · ${building.name}` : ""}.
        </p>
      </div>

      {/* Hero: outstanding dues */}
      <div
        className={`card-hover rounded-2xl border p-6 sm:p-8 animate-count-up ${
          hasDues
            ? "border-destructive/30 bg-gradient-to-br from-destructive/10 via-card to-card"
            : "border-[hsl(151_100%_41%/0.25)] bg-gradient-to-br from-[hsl(151_100%_41%/0.08)] via-card to-card glow-success"
        }`}
      >
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {hasDues ? (
                <AlertTriangle className="w-4 h-4 text-destructive" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-[hsl(151_100%_45%)]" />
              )}
              Outstanding Dues
            </div>
            <div
              className={`mt-2 text-4xl sm:text-5xl font-bold tracking-tight ${
                hasDues ? "text-destructive" : "text-[hsl(151_100%_45%)]"
              }`}
            >
              {formatCurrency(totalOutstanding)}
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              {hasDues
                ? `Please clear pending dues${flats.length > 1 ? ` across ${flats.length} flats` : ""}.`
                : "You are all caught up. Thank you!"}
              {flats.length > 1 ? "" : ""}
            </p>
          </div>
          {hasDues && (
            <Link href="/resident/dues">
              <Button className="btn-big">
                <CreditCard className="w-5 h-5" />
                Pay Now
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-up animate-delay-150">
        {/* My Flat */}
        <div className="card-hover card-soft">
          <div className="flex items-start justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              My Flat
            </span>
            <div className="flex w-10 h-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <HomeIcon className="w-5 h-5" />
            </div>
          </div>
          {primaryFlat ? (
            <>
              <div className="text-3xl font-bold tracking-tight whitespace-nowrap tabular-nums">Flat {primaryFlat.flat_number}</div>
              <div className="text-sm text-muted-foreground mt-1 capitalize">
                {primaryFlat.ownership_type ?? "—"}
                {primaryFlat.floor != null ? ` · Floor ${primaryFlat.floor}` : ""}
                {primaryFlat.block ? ` · Block ${primaryFlat.block}` : ""}
              </div>
              {primaryFlat.monthly_fee != null && (
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="text-xs text-muted-foreground">Monthly fee</div>
                  <div className="text-xl font-semibold mt-1">
                    {formatCurrency(Number(primaryFlat.monthly_fee))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-muted-foreground">No flat linked yet. Please contact admin.</div>
          )}
        </div>

        {/* This Month's Bill */}
        <div className="card-hover card-soft">
          <div className="flex items-start justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              This Month&apos;s Bill
            </span>
            <div className="flex w-10 h-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="w-5 h-5" />
            </div>
          </div>
          {currentInvoice ? (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <div className="text-3xl font-bold tracking-tight">
                  {formatCurrency(Number(currentInvoice.amount))}
                </div>
                <StatusPill status={currentInvoice.status} />
              </div>
              <div className="text-sm text-muted-foreground mt-2">
                {formatDate(currentInvoice.billing_month)}
                {currentInvoice.due_date ? ` · Due ${formatDate(currentInvoice.due_date)}` : ""}
              </div>
              <Link href="/resident/dues" className="inline-block mt-4">
                <Button variant="outline" className="btn-big">
                  View Bill <ArrowRight className="w-5 h-5" />
                </Button>
              </Link>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">
              No bill generated for {formatDate(monthStart)} yet.
            </div>
          )}
        </div>

        {/* Recent Notices */}
        <div className="card-hover card-soft">
          <div className="flex items-start justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Recent Notices
            </span>
            <div className="flex w-10 h-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Megaphone className="w-5 h-5" />
            </div>
          </div>
          {notices && notices.length > 0 ? (
            <ul className="space-y-3 divide-y divide-border">
              {notices.map((n) => (
                <li key={n.id} className="pt-3 first:pt-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold">{n.title}</div>
                    {n.pinned && (
                      <span className="text-xs status-info px-2 py-0.5 rounded-full">Pinned</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{formatDate(n.created_at)}</div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-muted-foreground">No notices yet.</div>
          )}
          <Link href="/resident/notices" className="inline-block mt-4 text-primary text-sm font-semibold hover:underline">
            See all notices →
          </Link>
        </div>

        {/* Building Fund Balance */}
        <div className="card-hover card-soft">
          <div className="flex items-start justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Building Fund Balance
            </span>
            <div className="flex w-10 h-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <PiggyBank className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-bold tracking-tight text-[hsl(151_100%_45%)]">
            {formatLakh(Number(building?.fund_balance ?? 0))}
          </div>
          <div className="text-sm text-muted-foreground mt-2">
            Total money in the building&apos;s common account.
          </div>
          <Link href="/resident/transparency" className="inline-block mt-4 text-primary text-sm font-semibold hover:underline">
            See where money goes →
          </Link>
        </div>
      </div>

      {/* Action Buttons — resident landing hero CTAs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-fade-up animate-delay-300">
        <Link href="#pay-now" scroll className="block">
          <Button className="btn-hero w-full glow-amber">
            <CreditCard className="w-5 h-5" />
            Pay Now
          </Button>
        </Link>
        <Link href="/resident/dues" className="block">
          <Button variant="outline" className="btn-hero w-full">
            <FileText className="w-5 h-5" />
            View My Dues
          </Button>
        </Link>
        <Link href="/resident/complaints" className="block">
          <Button variant="outline" className="btn-hero w-full">
            <MessageSquare className="w-5 h-5" />
            Raise Complaint
          </Button>
        </Link>
      </div>

      {/* Pay Now Card / Instructions */}
      <div id="pay-now" className="card-soft scroll-mt-24 animate-fade-up animate-delay-300">
        <h2 className="text-xl font-semibold">How to Pay</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Online payment is coming soon. For now, please pay using one of the methods below
          and share the reference number with the admin.
        </p>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-xl border border-border bg-secondary/30 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bank Transfer</div>
            <div className="text-lg font-semibold mt-1">{building?.name ?? "Building"} Welfare Account</div>
            <div className="text-sm text-muted-foreground mt-1">
              Please contact admin for current bank details and IBAN.
            </div>
          </div>
          <div className="rounded-xl border border-border bg-secondary/30 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cash / Cheque</div>
            <div className="text-lg font-semibold mt-1">Hand over to Admin Office</div>
            <div className="text-sm text-muted-foreground mt-1">
              Always collect a receipt — you can also download receipts from the Payments page.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
