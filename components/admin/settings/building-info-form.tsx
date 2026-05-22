"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";
import { updateBuildingInfo } from "@/app/actions/buildings";

// v1 = Karachi only with an "Other" escape hatch. Adding more cities is
// a one-line change here + a matching entry in lib/bill-providers.ts.
// "Other" is a UI-only sentinel — when the admin picks it, we render an
// extra text input and save the actual city name (e.g. "Lahore"). The
// literal string "Other" must NEVER reach the DB or provider lookup
// would always fall back.
const CITY_OPTIONS = [
  { value: "Karachi", label: "Karachi" },
  { value: "Other", label: "Other" },
];

const KNOWN_CITY_VALUES = CITY_OPTIONS
  .filter((o) => o.value !== "Other")
  .map((o) => o.value.toLowerCase());

const MAX_CITY_LENGTH = 64;

export function BuildingInfoForm({
  initialCity,
}: {
  initialCity: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  // If the stored city matches a known preset, select it. Otherwise it's
  // a custom value — pre-select "Other" and seed the text input with the
  // stored string so the admin can edit it.
  const initialIsKnown =
    !!initialCity &&
    KNOWN_CITY_VALUES.includes(initialCity.trim().toLowerCase());
  const initialSelect = initialCity
    ? initialIsKnown
      ? CITY_OPTIONS.find(
          (o) => o.value.toLowerCase() === initialCity.trim().toLowerCase(),
        )!.value
      : "Other"
    : "";
  const initialCustom = initialCity && !initialIsKnown ? initialCity : "";

  const [citySelect, setCitySelect] = useState<string>(initialSelect);
  const [customCity, setCustomCity] = useState<string>(initialCustom);
  const [error, setError] = useState<string | null>(null);

  // Effective city to save: when "Other" is picked, use the typed value.
  const effectiveCity =
    citySelect === "Other" ? customCity.trim() : citySelect;
  const dirty = (effectiveCity ?? "") !== (initialCity ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!citySelect) {
      setError("Pick a city.");
      return;
    }
    if (citySelect === "Other") {
      if (!customCity.trim()) {
        setError("Type the city name.");
        return;
      }
      if (customCity.trim().length > MAX_CITY_LENGTH) {
        setError(`City name must be ${MAX_CITY_LENGTH} characters or fewer.`);
        return;
      }
    }
    const cityToSave = effectiveCity;
    start(async () => {
      try {
        await updateBuildingInfo({ city: cityToSave });
        toast({ title: "Building info saved" });
        router.refresh();
      } catch (err) {
        const msg = friendlyErrorMessage(err, "Could not save building info");
        setError(msg);
        toast({
          title: "Could not save",
          description: msg,
          variant: "destructive",
        });
      }
    });
  }

  return (
    <form onSubmit={submit} className="card-soft space-y-4 max-w-xl">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
          <Building2 className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <p className="text-sm text-muted-foreground">
            Your building&rsquo;s city drives the Bill Accounts provider list
            (K-Electric, SSGC, internet providers, lift AMCs, etc.).
          </p>
        </div>
      </div>

      <div>
        <Label htmlFor="city" className="text-base">
          City
        </Label>
        <Select value={citySelect} onValueChange={setCitySelect}>
          <SelectTrigger id="city" className="h-12">
            <SelectValue placeholder="Pick a city" />
          </SelectTrigger>
          <SelectContent>
            {CITY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {citySelect === "Other" && (
        <div>
          <Label htmlFor="city-other" className="text-base">
            City name
          </Label>
          <Input
            id="city-other"
            value={customCity}
            onChange={(e) => setCustomCity(e.target.value)}
            placeholder="e.g. Lahore, Islamabad"
            maxLength={MAX_CITY_LENGTH}
            className="h-12"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Type the real city name. The provider list will fall back to the
            common defaults until that city ships with its own preset.
          </p>
        </div>
      )}

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      <div className="flex justify-end pt-1">
        <Button type="submit" disabled={pending || !dirty} className="btn-big">
          {pending ? "Saving..." : "Save Building Info"}
        </Button>
      </div>
    </form>
  );
}
