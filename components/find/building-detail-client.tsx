"use client";

import { useState } from "react";
import { cn, formatCurrency, formatLakh } from "@/lib/utils";
import { toIntlNoPlus } from "@/lib/phone";
import type { PublicBuildingDetail } from "@/app/actions/listings";
import {
  Building2,
  MapPin,
  Bed,
  Bath,
  Car,
  Sofa,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";

type Listing = PublicBuildingDetail["listings"][number];

export function BuildingDetailClient({
  building,
}: {
  building: PublicBuildingDetail;
}) {
  const [filter, setFilter] = useState<"all" | "rent" | "sell">("all");

  const rentListings = building.listings.filter((l) => l.listing_type === "rent");
  const sellListings = building.listings.filter((l) => l.listing_type === "sell");
  const visible =
    filter === "rent" ? rentListings : filter === "sell" ? sellListings : building.listings;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-5 space-y-4">
      {/* Hero — compact, one row on desktop */}
      <section className="rounded-xl border border-primary/25 bg-gradient-to-br from-primary/8 via-card to-card p-4 sm:p-5">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="flex w-10 h-10 sm:w-11 sm:h-11 items-center justify-center rounded-lg bg-primary/15 border border-primary/25 shrink-0">
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
                {building.name}
              </h1>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border bg-[hsl(151_70%_55%/0.12)] border-[hsl(151_70%_55%/0.30)] text-[hsl(151_70%_55%)] text-[10px] font-medium uppercase tracking-wider shrink-0">
                <ShieldCheck className="w-3 h-3" />
                Listed by Union
              </span>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1 flex items-center gap-1 flex-wrap">
              {(building.address || building.city) && (
                <>
                  <MapPin className="w-3 h-3 shrink-0" />
                  <span>{[building.address, building.city].filter(Boolean).join(", ")}</span>
                </>
              )}
              {building.total_flats > 0 && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="tabular-nums">{building.total_flats} flats</span>
                </>
              )}
              {building.monthly_fee_default > 0 && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="tabular-nums">
                    {formatCurrency(building.monthly_fee_default)} maintenance/mo
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
      </section>

      {/* Filter row + count — inline, tight */}
      <div className="flex items-center gap-2 flex-wrap">
        <FilterPill
          active={filter === "all"}
          onClick={() => setFilter("all")}
          label="All"
          count={building.listings.length}
        />
        <FilterPill
          active={filter === "rent"}
          onClick={() => setFilter("rent")}
          label="For Rent"
          count={rentListings.length}
        />
        <FilterPill
          active={filter === "sell"}
          onClick={() => setFilter("sell")}
          label="For Sale"
          count={sellListings.length}
        />
        <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
          {visible.length} available
        </span>
      </div>

      {/* Listings — 3 columns on desktop for density */}
      {visible.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No flats match this filter right now.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {visible.map((l) => (
            <ListingCard key={l.id} listing={l} building={building} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-secondary",
      )}
    >
      {label}
      <span
        className={cn(
          "tabular-nums text-[10px] px-1.5 rounded-full",
          active ? "bg-primary-foreground/15" : "bg-secondary",
        )}
      >
        {count}
      </span>
    </button>
  );
}

function ListingCard({
  listing,
  building,
}: {
  listing: Listing;
  building: PublicBuildingDetail;
}) {
  const isRent = listing.listing_type === "rent";
  const priceLabel = isRent
    ? `${formatCurrency(listing.price)}/mo`
    : formatLakh(listing.price);
  const priceColor = isRent ? "text-[hsl(151_70%_55%)]" : "text-primary";

  // Inline location string — Flat X · Floor Y · Block Z
  const locationParts = [
    `Flat ${listing.flat_number}`,
    listing.floor != null ? `Floor ${listing.floor}` : null,
    listing.block ? `Block ${listing.block}` : null,
  ].filter(Boolean);

  return (
    <article className="rounded-xl border border-border bg-card overflow-hidden hover:border-primary/40 transition-colors flex flex-col">
      <div className="p-4 flex-1">
        {/* Top row — type pill + price together */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <span
            className={cn(
              "inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium uppercase tracking-wider shrink-0",
              isRent
                ? "bg-[hsl(151_70%_55%/0.12)] text-[hsl(151_70%_55%)] border-[hsl(151_70%_55%/0.30)]"
                : "bg-primary/10 text-primary border-primary/25",
            )}
          >
            For {isRent ? "Rent" : "Sale"}
          </span>
          <h3
            className={cn(
              "text-xl font-bold tracking-tight tabular-nums text-right",
              priceColor,
            )}
          >
            {priceLabel}
          </h3>
        </div>

        {/* Flat location — compact */}
        <p className="text-xs font-medium text-foreground/90 tabular-nums">
          {locationParts.join(" · ")}
        </p>

        {/* Features — tighter chips */}
        {(listing.bedrooms != null ||
          listing.bathrooms != null ||
          listing.parking ||
          listing.furnished) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {listing.bedrooms != null && (
              <FeatureChip icon={<Bed className="w-3 h-3" />} label={`${listing.bedrooms} bed`} />
            )}
            {listing.bathrooms != null && (
              <FeatureChip icon={<Bath className="w-3 h-3" />} label={`${listing.bathrooms} bath`} />
            )}
            {listing.parking && (
              <FeatureChip icon={<Car className="w-3 h-3" />} label="Parking" />
            )}
            {listing.furnished && (
              <FeatureChip icon={<Sofa className="w-3 h-3" />} label="Furnished" />
            )}
          </div>
        )}

        {listing.description && (
          <p className="mt-2.5 text-xs text-muted-foreground leading-relaxed line-clamp-3">
            {listing.description}
          </p>
        )}
      </div>

      <div className="px-4 pb-4">
        <WhatsAppButton listing={listing} building={building} />
      </div>
    </article>
  );
}

function FeatureChip({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-secondary/50 border border-border text-[10px] text-muted-foreground">
      {icon}
      {label}
    </span>
  );
}

function WhatsAppButton({
  listing,
  building,
}: {
  listing: Listing;
  building: PublicBuildingDetail;
}) {
  const intl = building.public_whatsapp ? toIntlNoPlus(building.public_whatsapp) : null;

  const message = `Assalam Alaikum, I'm interested in Flat ${listing.flat_number} at ${building.name}${building.city ? `, ${building.city}` : ""}.

Listed for ${listing.listing_type === "rent" ? "Rent" : "Sale"} — ${
    listing.listing_type === "rent"
      ? `${formatCurrency(listing.price)}/month`
      : formatLakh(listing.price)
  }${listing.bedrooms != null ? ` · ${listing.bedrooms} bed` : ""}${listing.bathrooms != null ? ` · ${listing.bathrooms} bath` : ""}${listing.parking ? " · parking" : ""}${listing.furnished ? " · furnished" : ""}

Please share more details and schedule a visit when convenient.`;

  if (!intl) {
    return (
      <button
        type="button"
        disabled
        className="w-full h-9 rounded-lg border border-border bg-secondary/30 text-xs text-muted-foreground"
      >
        Contact info coming soon
      </button>
    );
  }

  const url = `https://wa.me/${intl}?text=${encodeURIComponent(message)}`;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "w-full inline-flex items-center justify-center gap-2 h-9 rounded-lg",
        "bg-[#25D366] text-white hover:bg-[#1da851] transition-colors shadow-sm",
        "text-sm font-semibold",
      )}
    >
      <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
      Message on WhatsApp
      <ArrowRight className="w-3.5 h-3.5" />
    </a>
  );
}
