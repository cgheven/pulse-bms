"use client";
import * as React from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { formatDateInput } from "@/lib/utils";

interface DatePickerProps {
  value: string;                       // ISO yyyy-MM-dd
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minDate?: Date;
  maxDate?: Date;
  className?: string;
}

function parseISO(value: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
}

function formatDisplay(d: Date) {
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

export function DatePicker({ value, onChange, placeholder = "Pick a date", disabled, minDate, maxDate, className }: DatePickerProps) {
  const isMobile = useMediaQuery("(max-width: 639px)");
  const [open, setOpen] = React.useState(false);
  const selected = parseISO(value);

  // Mobile: native <input type="date"> for OS-native picker (wheel on iOS, dialog on Android).
  // Styled to match the desktop trigger so it blends with the rest of the UI.
  if (isMobile) {
    return (
      <div className={cn("relative", className)}>
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          min={minDate ? formatDateInput(minDate) : undefined}
          max={maxDate ? formatDateInput(maxDate) : undefined}
          className={cn(
            "w-full h-10 px-3 pr-10 rounded-lg border border-sidebar-border bg-card text-sm text-foreground",
            "focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/50",
            "[&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer",
            disabled && "opacity-50 pointer-events-none"
          )}
        />
        <CalendarIcon className="w-4 h-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
    );
  }

  // Desktop: popover with calendar grid
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "inline-flex items-center justify-between gap-2 h-9 w-full px-3 rounded-lg border border-sidebar-border bg-card text-sm transition-colors",
            "hover:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/50",
            !selected && "text-muted-foreground",
            disabled && "opacity-50 pointer-events-none",
            className
          )}
        >
          <span>{selected ? formatDisplay(selected) : placeholder}</span>
          <CalendarIcon className="w-4 h-4 text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-0">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => {
            if (d) {
              onChange(formatDateInput(d));
              setOpen(false);
            }
          }}
          disabled={(date) => {
            if (minDate && date < minDate) return true;
            if (maxDate && date > maxDate) return true;
            return false;
          }}
          defaultMonth={selected ?? new Date()}
        />
      </PopoverContent>
    </Popover>
  );
}
