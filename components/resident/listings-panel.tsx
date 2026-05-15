"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrency, formatLakh } from "@/lib/utils";
import { upsertListing, deactivateListing } from "@/app/actions/listings";
import {
  AlertTriangle,
  Home,
  Tag,
  Trash2,
  Pencil,
  Plus,
  CheckCircle2,
  Bed,
  Bath,
  Car,
  Sofa,
} from "lucide-react";

type Existing = {
  id: string;
  flat_id: string;
  listing_type: "rent" | "sell";
  price: number;
  bedrooms: number | null;
  bathrooms: number | null;
  parking: boolean;
  furnished: boolean;
  description: string | null;
  is_active: boolean;
  updated_at: string;
};

type FlatCard = {
  id: string;
  flat_number: string;
  floor: number | null;
  block: string | null;
  existing: Existing | null;
};

export function ListingsPanel({
  flats,
  buildingListingEnabled,
  buildingHasWhatsapp,
}: {
  flats: FlatCard[];
  buildingListingEnabled: boolean;
  buildingHasWhatsapp: boolean;
}) {
  return (
    <div className="space-y-4">
      {!buildingListingEnabled && (
        <DisclosureBanner
          tone="warning"
          icon={<AlertTriangle className="w-4 h-4 text-primary" />}
          title="Your Union hasn't switched on public listings yet"
          body="You can still create a listing here, but it won't appear on /find until the Union enables it in their settings."
        />
      )}
      {buildingListingEnabled && !buildingHasWhatsapp && (
        <DisclosureBanner
          tone="warning"
          icon={<AlertTriangle className="w-4 h-4 text-primary" />}
          title="Union WhatsApp number is missing"
          body="Without a Union WhatsApp number, interested renters/buyers can't be routed anywhere. Ask your Union to add one in /union/settings."
        />
      )}

      {flats.map((flat) => (
        <FlatListingCard key={flat.id} flat={flat} />
      ))}
    </div>
  );
}

function DisclosureBanner({
  tone,
  icon,
  title,
  body,
}: {
  tone: "warning" | "info";
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  const cls =
    tone === "warning"
      ? "border-primary/30 bg-primary/5"
      : "border-border bg-secondary/30";
  return (
    <div className={cn("rounded-lg border p-3 flex items-start gap-2.5", cls)}>
      <div className="shrink-0 mt-0.5">{icon}</div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{body}</p>
      </div>
    </div>
  );
}

function FlatListingCard({ flat }: { flat: FlatCard }) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [isPending, start] = useTransition();
  const hasListing = Boolean(flat.existing);

  function handleRemove() {
    if (!flat.existing) return;
    start(async () => {
      try {
        await deactivateListing(flat.existing!.id);
        toast({ title: "Listing removed" });
        setRemoving(false);
        router.refresh();
      } catch (err) {
        toast({
          title: "Could not remove",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
      }
    });
  }

  return (
    <div
      className={cn(
        "rounded-xl border bg-card overflow-hidden transition-colors",
        hasListing ? "border-primary/30" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Home className="w-4 h-4 text-primary" />
            <h3 className="text-base font-semibold tracking-tight tabular-nums">
              Flat {flat.flat_number}
            </h3>
            {hasListing && flat.existing && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium uppercase tracking-wider",
                  flat.existing.listing_type === "rent"
                    ? "bg-[hsl(151_70%_55%/0.12)] text-[hsl(151_70%_55%)] border-[hsl(151_70%_55%/0.30)]"
                    : "bg-primary/10 text-primary border-primary/25",
                )}
              >
                <CheckCircle2 className="w-3 h-3" />
                Live · for {flat.existing.listing_type === "rent" ? "Rent" : "Sale"}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {flat.floor != null ? `Floor ${flat.floor}` : ""}
            {flat.floor != null && flat.block ? " · " : ""}
            {flat.block ? `Block ${flat.block}` : ""}
            {!flat.floor && !flat.block ? "—" : ""}
          </div>
        </div>

        {!editing && (
          <div className="flex items-center gap-1.5 shrink-0">
            {hasListing ? (
              <>
                <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                  <Pencil className="w-3.5 h-3.5" />
                  Update
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setRemoving(true)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={() => setEditing(true)}>
                <Plus className="w-3.5 h-3.5" />
                List this flat
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Existing listing preview when not editing */}
      {hasListing && flat.existing && !editing && (
        <div className="px-4 pb-4 grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-border pt-3">
          <ChipStat
            icon={<Tag className="w-3.5 h-3.5" />}
            label={flat.existing.listing_type === "rent" ? "Rent" : "Sale price"}
            value={formatCurrency(flat.existing.price)}
            tone={flat.existing.listing_type === "rent" ? "success" : "primary"}
          />
          {flat.existing.bedrooms != null && (
            <ChipStat
              icon={<Bed className="w-3.5 h-3.5" />}
              label="Bedrooms"
              value={String(flat.existing.bedrooms)}
            />
          )}
          {flat.existing.bathrooms != null && (
            <ChipStat
              icon={<Bath className="w-3.5 h-3.5" />}
              label="Bathrooms"
              value={String(flat.existing.bathrooms)}
            />
          )}
          <ChipStat
            icon={<Car className="w-3.5 h-3.5" />}
            label="Parking"
            value={flat.existing.parking ? "Yes" : "No"}
          />
          <ChipStat
            icon={<Sofa className="w-3.5 h-3.5" />}
            label="Furnished"
            value={flat.existing.furnished ? "Yes" : "No"}
          />
          {flat.existing.description && (
            <div className="col-span-2 sm:col-span-4 text-xs text-muted-foreground leading-relaxed border-t border-border pt-2">
              {flat.existing.description}
            </div>
          )}
        </div>
      )}

      {/* Edit / Create form */}
      {editing && (
        <ListingForm
          flat={flat}
          initial={flat.existing}
          isPending={isPending}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            router.refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={removing}
        title={`Remove listing for Flat ${flat.flat_number}?`}
        description="The listing will disappear from the public /find page immediately. You can list it again any time."
        confirmLabel={isPending ? "Removing…" : "Remove listing"}
        onConfirm={handleRemove}
        onCancel={() => setRemoving(false)}
      />
    </div>
  );
}

function ChipStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "success" | "primary";
}) {
  const color =
    tone === "success"
      ? "text-[hsl(151_70%_55%)]"
      : tone === "primary"
        ? "text-primary"
        : "text-foreground";
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <span className={color}>{icon}</span>
        {label}
      </div>
      <div className={cn("mt-0.5 text-sm font-semibold tabular-nums truncate", color)}>
        {value}
      </div>
    </div>
  );
}

function ListingForm({
  flat,
  initial,
  isPending,
  onCancel,
  onSaved,
}: {
  flat: FlatCard;
  initial: Existing | null;
  isPending: boolean;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [type, setType] = useState<"rent" | "sell">(initial?.listing_type ?? "rent");
  const [price, setPrice] = useState<string>(
    initial?.price != null ? String(initial.price) : "",
  );
  const [bedrooms, setBedrooms] = useState<string>(
    initial?.bedrooms != null ? String(initial.bedrooms) : "",
  );
  const [bathrooms, setBathrooms] = useState<string>(
    initial?.bathrooms != null ? String(initial.bathrooms) : "",
  );
  const [parking, setParking] = useState<boolean>(Boolean(initial?.parking));
  const [furnished, setFurnished] = useState<boolean>(Boolean(initial?.furnished));
  const [description, setDescription] = useState<string>(initial?.description ?? "");
  const [submitting, startSubmit] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    // Strip commas + spaces — every Pakistani user types "35,000" naturally.
    const cleanPrice = price.replace(/[,\s]/g, "");
    const parsedPrice = Number(cleanPrice);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      toast({ title: "Enter a valid price", variant: "destructive" });
      return;
    }
    // Empty bedrooms/bathrooms = "not specified" (null). "0" = studio (kept).
    const parsedBed = bedrooms === "" ? null : Number(bedrooms);
    const parsedBath = bathrooms === "" ? null : Number(bathrooms);
    if (parsedBed !== null && (!Number.isFinite(parsedBed) || parsedBed < 0)) {
      toast({ title: "Bedrooms must be 0 or more", variant: "destructive" });
      return;
    }
    if (parsedBath !== null && (!Number.isFinite(parsedBath) || parsedBath < 0)) {
      toast({ title: "Bathrooms must be 0 or more", variant: "destructive" });
      return;
    }
    startSubmit(async () => {
      try {
        await upsertListing({
          flat_id: flat.id,
          listing_type: type,
          price: parsedPrice,
          bedrooms: parsedBed,
          bathrooms: parsedBath,
          parking,
          furnished,
          description: description.trim() || null,
        });
        toast({
          title: initial ? "Listing updated" : "Listing published",
          description: "It's now live on /find (if your Union has listings enabled).",
        });
        onSaved();
      } catch (err) {
        toast({
          title: "Could not save",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
      }
    });
  }

  return (
    <form
      onSubmit={submit}
      className="border-t border-border bg-secondary/20 p-4 space-y-4"
    >
      <div className="grid grid-cols-2 gap-3">
        {/* Type segmented control */}
        <div className="col-span-2">
          <Label>Listing type</Label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            {(
              [
                { v: "rent", label: "For Rent", color: "hsl(151 70% 55%)" },
                { v: "sell", label: "For Sale", color: "hsl(38 92% 60%)" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.v}
                type="button"
                onClick={() => setType(opt.v)}
                className={cn(
                  "h-10 rounded-md border text-sm font-medium transition-colors",
                  type === opt.v
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground hover:bg-secondary",
                )}
                style={type === opt.v ? { borderColor: opt.color, color: opt.color, backgroundColor: `${opt.color}1A` } : undefined}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="col-span-2">
          <Label>
            {type === "rent" ? "Monthly rent (Rs)" : "Selling price (Rs)"}
          </Label>
          <Input
            type="text"
            inputMode="numeric"
            placeholder={type === "rent" ? "35,000" : "85,00,000"}
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^\d,\s]/g, ""))}
            required
            className="h-11 text-base tabular-nums"
          />
          {price && Number.isFinite(Number(price.replace(/[,\s]/g, ""))) && (
            <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
              {type === "rent"
                ? `${formatCurrency(Number(price.replace(/[,\s]/g, "")))} / month`
                : formatLakh(Number(price.replace(/[,\s]/g, "")))}
            </p>
          )}
        </div>

        <div>
          <Label>Bedrooms</Label>
          <Input
            type="number"
            min={0}
            value={bedrooms}
            onChange={(e) => setBedrooms(e.target.value)}
            placeholder="2"
            className="h-11 text-base"
          />
        </div>
        <div>
          <Label>Bathrooms</Label>
          <Input
            type="number"
            min={0}
            value={bathrooms}
            onChange={(e) => setBathrooms(e.target.value)}
            placeholder="2"
            className="h-11 text-base"
          />
        </div>

        <ToggleRow
          label="Parking included"
          checked={parking}
          onChange={setParking}
          icon={<Car className="w-3.5 h-3.5" />}
        />
        <ToggleRow
          label="Furnished"
          checked={furnished}
          onChange={setFurnished}
          icon={<Sofa className="w-3.5 h-3.5" />}
        />

        <div className="col-span-2">
          <Label>Description (optional)</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief details for interested renters/buyers (200 chars)"
            maxLength={200}
            rows={3}
          />
          <div className="text-[10px] text-muted-foreground text-right mt-1">
            {description.length} / 200
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting || isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting || isPending}>
          {submitting ? "Saving…" : initial ? "Update listing" : "Publish listing"}
        </Button>
      </div>
    </form>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
  icon,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "h-11 rounded-md border flex items-center gap-2 px-3 text-sm font-medium transition-colors",
        checked
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      <span className={checked ? "text-primary" : "text-muted-foreground"}>
        {icon}
      </span>
      {label}
      <span className="ml-auto text-[10px] uppercase tracking-wider">
        {checked ? "Yes" : "No"}
      </span>
    </button>
  );
}
