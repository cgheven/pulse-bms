"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import type { DateRange, DateRangePreset } from "@/lib/reports/types";
import {
  ALL_PRESETS,
  presetRange,
  rangeLabel,
} from "@/lib/reports/date-range";

/**
 * Date-range picker for every reports page.
 *
 * Preset dropdown drives the from/to inputs. Picking "Custom range"
 * unlocks the inputs so the admin can type any dates; typing into the
 * inputs flips the preset to "custom" automatically so the dropdown
 * doesn't mislead.
 */
export function DateRangePicker({
  value,
  onChange,
  presets = ALL_PRESETS,
}: {
  value: DateRange;
  onChange: (next: DateRange) => void;
  presets?: DateRangePreset[];
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Range
        </Label>
        <Select
          value={value.preset}
          onValueChange={(v) => onChange(presetRange(v as DateRangePreset))}
        >
          <SelectTrigger className="min-w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {presets.map((p) => (
              <SelectItem key={p} value={p}>
                {rangeLabel(p)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="dr-from" className="text-xs uppercase tracking-wider text-muted-foreground">
          From
        </Label>
        <Input
          id="dr-from"
          type="date"
          value={value.from}
          onChange={(e) =>
            onChange({ ...value, preset: "custom", from: e.target.value })
          }
        />
      </div>
      <div>
        <Label htmlFor="dr-to" className="text-xs uppercase tracking-wider text-muted-foreground">
          To
        </Label>
        <Input
          id="dr-to"
          type="date"
          value={value.to}
          onChange={(e) =>
            onChange({ ...value, preset: "custom", to: e.target.value })
          }
        />
      </div>
    </div>
  );
}
