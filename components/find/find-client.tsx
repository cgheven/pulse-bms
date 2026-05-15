"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import {
  Building2,
  Search,
  MapPin,
  ArrowRight,
  Home as HomeIcon,
  Tag,
} from "lucide-react";
import { cn, formatLakh, formatCurrency } from "@/lib/utils";
import { buildSlug } from "@/lib/slug";
import type { PublicBuildingCard } from "@/app/actions/listings";

/* Hero — no data dependency, renders instantly while the grid streams */
export function FindHero() {
  return (
    <header className="relative overflow-hidden border-b border-border">
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/10 via-background to-background" />
      <div className="absolute -top-24 right-0 -z-10 w-[360px] h-[360px] rounded-full bg-primary/10 blur-3xl" />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <Link href="/find" className="inline-flex items-center gap-2">
            <div className="flex w-7 h-7 items-center justify-center rounded-md bg-primary/15 border border-primary/25">
              <Building2 className="w-4 h-4 text-primary" />
            </div>
            <span className="font-bold text-sm tracking-tight">Pulse BMS</span>
          </Link>
          <Link
            href="/login"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Admin sign in →
          </Link>
        </div>
        <div className="mt-5 sm:mt-7 max-w-2xl">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Find a flat — <span className="text-primary">straight from the building</span>.
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Listed by owners. Verified by Union.
          </p>
        </div>
      </div>
    </header>
  );
}

/* Skeleton for the grid Suspense fallback */
export function FindGridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="h-32 bg-secondary/30 animate-pulse" />
          <div className="p-4 space-y-3">
            <div className="h-4 w-40 rounded bg-secondary/50 animate-pulse" />
            <div className="h-3 w-32 rounded bg-secondary/40 animate-pulse" />
            <div className="h-12 rounded bg-secondary/20 animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* Searchable building grid — client-side filter only */
export function FindGrid({ buildings }: { buildings: PublicBuildingCard[] }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return buildings;
    return buildings.filter(
      (b) =>
        b.name.toLowerCase().includes(s) ||
        (b.address ?? "").toLowerCase().includes(s) ||
        (b.city ?? "").toLowerCase().includes(s),
    );
  }, [buildings, q]);

  return (
    <>
      {/* Search + count on one line — saves a row */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search building, address, city…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-10 pl-9 text-sm"
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
          {buildings.length === 0
            ? "No buildings yet"
            : `${filtered.length} of ${buildings.length}`}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <Building2 className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
          <p className="text-sm font-medium">
            {buildings.length === 0
              ? "No listings yet — check back soon."
              : "Nothing matches your search."}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            New listings are added every week as building Unions onboard.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((b) => (
            <BuildingCard key={b.id} b={b} />
          ))}
        </div>
      )}
    </>
  );
}

function BuildingCard({ b }: { b: PublicBuildingCard }) {
  return (
    <Link
      href={`/find/${buildSlug(b.name, b.id)}`}
      className="group rounded-xl border border-border bg-card overflow-hidden hover:border-primary/40 hover:shadow-[0_0_30px_-18px_hsl(38_92%_55%/0.4)] transition-all"
    >
      <div className="h-32 bg-gradient-to-br from-primary/15 via-primary/5 to-secondary/30 relative">
        <div className="absolute inset-0 flex items-center justify-center">
          <Building2 className="w-12 h-12 text-primary/30" />
        </div>
        <div className="absolute top-3 right-3 flex flex-wrap items-center gap-1.5 max-w-[calc(100%-1.5rem)] justify-end">
          {b.rent_count > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[hsl(151_70%_55%/0.15)] border border-[hsl(151_70%_55%/0.35)] text-[10px] font-medium uppercase tracking-wider text-[hsl(151_70%_55%)] backdrop-blur">
              {b.rent_count} for rent
            </span>
          )}
          {b.sell_count > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary/15 border border-primary/35 text-[10px] font-medium uppercase tracking-wider text-primary backdrop-blur">
              {b.sell_count} for sale
            </span>
          )}
        </div>
      </div>

      <div className="p-4">
        <h3 className="text-base font-semibold tracking-tight line-clamp-1">
          {b.name}
        </h3>
        {b.address || b.city ? (
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1 line-clamp-1">
            <MapPin className="w-3 h-3 shrink-0" />
            {[b.address, b.city].filter(Boolean).join(", ")}
          </p>
        ) : null}

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          {b.rent_from != null && (
            <PriceTile
              icon={<Tag className="w-3 h-3" />}
              label="Rent from"
              value={`${formatCurrency(b.rent_from)}/mo`}
              tone="success"
            />
          )}
          {b.sell_from != null && (
            <PriceTile
              icon={<HomeIcon className="w-3 h-3" />}
              label="Sale from"
              value={formatLakh(b.sell_from)}
              tone="primary"
            />
          )}
        </div>

        <div
          className={cn(
            "mt-3 pt-3 border-t border-border flex items-center justify-between text-xs",
            "text-muted-foreground group-hover:text-primary transition-colors",
          )}
        >
          <span>View available flats</span>
          <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </Link>
  );
}

function PriceTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "success" | "primary";
}) {
  const color = tone === "success" ? "text-[hsl(151_70%_55%)]" : "text-primary";
  return (
    <div className="rounded-md border border-border bg-secondary/30 px-2.5 py-1.5">
      <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <span className={color}>{icon}</span>
        {label}
      </div>
      <div className={cn("mt-0.5 text-xs font-semibold tabular-nums truncate", color)}>
        {value}
      </div>
    </div>
  );
}
