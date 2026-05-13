"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setAttendance, type AttendanceStatus } from "@/app/actions/staff";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type AttendanceRow = {
  date: string;
  status: AttendanceStatus;
};

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "P",
  absent:  "A",
  half_day: "½",
  leave:   "L",
};

// Dark-theme harmonised colour tokens
const STATUS_CELL: Record<AttendanceStatus, string> = {
  present:  "bg-[hsl(151_70%_32%/0.15)] border-[hsl(151_70%_32%/0.4)]",
  absent:   "bg-[hsl(0_72%_55%/0.15)]   border-[hsl(0_72%_55%/0.4)]",
  half_day: "bg-[hsl(38_92%_55%/0.15)]  border-[hsl(38_92%_55%/0.4)]",
  leave:    "bg-[hsl(191_100%_50%/0.12)] border-[hsl(191_100%_50%/0.35)]",
};
const STATUS_PILL: Record<AttendanceStatus, string> = {
  present:  "bg-[hsl(151_70%_32%/0.25)] text-[hsl(151_70%_50%)]",
  absent:   "bg-[hsl(0_72%_55%/0.25)]   text-[hsl(0_72%_70%)]",
  half_day: "bg-[hsl(38_92%_55%/0.25)]  text-[hsl(38_92%_70%)]",
  leave:    "bg-[hsl(191_100%_50%/0.2)] text-[hsl(191_100%_60%)]",
};
const SUMMARY_PILL: Record<AttendanceStatus, string> = {
  present:  "bg-[hsl(151_70%_32%/0.15)] text-[hsl(151_70%_50%)] border border-[hsl(151_70%_32%/0.3)]",
  absent:   "bg-[hsl(0_72%_55%/0.15)]   text-[hsl(0_72%_70%)] border border-[hsl(0_72%_55%/0.3)]",
  half_day: "bg-[hsl(38_92%_55%/0.15)]  text-[hsl(38_92%_70%)] border border-[hsl(38_92%_55%/0.3)]",
  leave:    "bg-[hsl(191_100%_50%/0.12)] text-[hsl(191_100%_60%)] border border-[hsl(191_100%_50%/0.25)]",
};

export function AttendanceCalendar({
  staffId,
  attendance,
  initialMonth,
}: {
  staffId: string;
  attendance: AttendanceRow[];
  initialMonth: string;
}) {
  const router = useRouter();
  const [month, setMonth] = useState(initialMonth);
  const [pending, start] = useTransition();

  const map = new Map<string, AttendanceStatus>();
  attendance.forEach((r) => map.set(r.date, r.status));

  const [year, monthNum] = month.split("-").map(Number);
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const firstWeekday = new Date(year, monthNum - 1, 1).getDay();

  const today = new Date().toISOString().split("T")[0];

  const setStatus = (date: string, status: AttendanceStatus) => {
    start(async () => {
      await setAttendance({ staff_id: staffId, date, status });
      router.refresh();
    });
  };

  const navigate = (delta: number) => {
    const d = new Date(year, monthNum - 1 + delta, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    setMonth(ym);
    router.push(`?month=${ym}`);
  };

  // Counts
  let present = 0, absent = 0, half = 0, leave = 0;
  attendance.forEach((r) => {
    if (r.status === "present") present++;
    else if (r.status === "absent") absent++;
    else if (r.status === "half_day") half++;
    else if (r.status === "leave") leave++;
  });

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(i);

  const monthLabel = new Date(year, monthNum - 1, 1).toLocaleString("en-PK", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="rounded-xl border border-border bg-card shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigate(-1)} disabled={pending} aria-label="Previous month">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="font-semibold text-base min-w-[150px] text-center tabular-nums">
            {monthLabel}
          </div>
          <Button variant="outline" size="icon" onClick={() => navigate(1)} disabled={pending} aria-label="Next month">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs">
          <span className={`px-2 py-0.5 rounded-full ${SUMMARY_PILL.present}`}>{present} Present</span>
          <span className={`px-2 py-0.5 rounded-full ${SUMMARY_PILL.absent}`}>{absent} Absent</span>
          <span className={`px-2 py-0.5 rounded-full ${SUMMARY_PILL.half_day}`}>{half} Half</span>
          <span className={`px-2 py-0.5 rounded-full ${SUMMARY_PILL.leave}`}>{leave} Leave</span>
        </div>
      </div>

      {/* Mobile summary */}
      <div className="sm:hidden flex items-center gap-2 px-4 py-3 text-xs border-b border-border overflow-x-auto">
        <span className={`px-2 py-0.5 rounded-full whitespace-nowrap ${SUMMARY_PILL.present}`}>{present} P</span>
        <span className={`px-2 py-0.5 rounded-full whitespace-nowrap ${SUMMARY_PILL.absent}`}>{absent} A</span>
        <span className={`px-2 py-0.5 rounded-full whitespace-nowrap ${SUMMARY_PILL.half_day}`}>{half} ½</span>
        <span className={`px-2 py-0.5 rounded-full whitespace-nowrap ${SUMMARY_PILL.leave}`}>{leave} L</span>
      </div>

      {/* Calendar */}
      <div className="p-4">
        {/* Weekday header */}
        <div className="grid grid-cols-7 gap-1.5 text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="text-center py-1">{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-1.5">
          {cells.map((day, i) => {
            if (day === null) return <div key={`e-${i}`} className="aspect-square" />;
            const dateStr = `${year}-${String(monthNum).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const status = map.get(dateStr);
            const isToday = dateStr === today;
            const isFuture = dateStr > today;

            return (
              <div
                key={dateStr}
                className={cn(
                  "relative aspect-square rounded-lg border p-1 sm:p-1.5 flex flex-col text-xs transition-colors",
                  status ? STATUS_CELL[status] : "bg-secondary/30 border-border/60",
                  isToday && "ring-2 ring-primary ring-offset-2 ring-offset-card",
                  isFuture && "opacity-50",
                )}
              >
                <div className="flex items-center justify-between gap-0.5">
                  <span className={cn("font-semibold text-xs sm:text-sm tabular-nums", isToday && "text-primary")}>
                    {day}
                  </span>
                  {status && (
                    <span className={cn("text-[10px] font-bold px-1 rounded leading-none py-0.5", STATUS_PILL[status])}>
                      {STATUS_LABEL[status]}
                    </span>
                  )}
                </div>
                <Select
                  value={status ?? ""}
                  onValueChange={(v) => setStatus(dateStr, v as AttendanceStatus)}
                >
                  <SelectTrigger
                    className="mt-auto h-6 text-[10px] px-1 border-0 bg-transparent hover:bg-background/40 [&>svg]:w-3 [&>svg]:h-3"
                    aria-label={`Set ${dateStr} attendance`}
                  >
                    <SelectValue placeholder={<span className="text-muted-foreground">Mark</span>} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="present">Present</SelectItem>
                    <SelectItem value="absent">Absent</SelectItem>
                    <SelectItem value="half_day">Half day</SelectItem>
                    <SelectItem value="leave">Leave</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
