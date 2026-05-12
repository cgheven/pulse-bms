"use client";
import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, type DayPickerProps } from "react-day-picker";
import { cn } from "@/lib/utils";

import "react-day-picker/dist/style.css";

export type CalendarProps = DayPickerProps;

export function Calendar({ className, classNames, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays
      className={cn("p-2 text-sm select-none", className)}
      classNames={{
        months: "flex flex-col gap-3",
        month: "space-y-3",
        month_caption: "flex justify-center items-center h-8 relative",
        caption_label: "text-sm font-semibold text-foreground",
        nav: "flex items-center gap-1 absolute inset-x-0 top-0 px-1 justify-between",
        button_previous:
          "h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors",
        button_next:
          "h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors",
        month_grid: "border-collapse",
        weekdays: "flex",
        weekday:
          "w-9 h-8 text-[11px] font-medium text-muted-foreground uppercase tracking-wide flex items-center justify-center",
        week: "flex w-full mt-1",
        day: "w-9 h-9 p-0 text-center relative",
        day_button:
          "w-9 h-9 inline-flex items-center justify-center rounded-md text-sm font-medium text-foreground hover:bg-primary/10 hover:text-primary transition-colors aria-selected:!bg-primary aria-selected:!text-primary-foreground aria-selected:hover:!bg-primary disabled:opacity-30 disabled:pointer-events-none",
        today: "ring-1 ring-primary/50 ring-inset rounded-md",
        outside: "text-muted-foreground/40",
        disabled: "opacity-30 pointer-events-none",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />,
      }}
      {...props}
    />
  );
}
