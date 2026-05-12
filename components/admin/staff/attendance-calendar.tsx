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
import { cn } from "@/lib/utils";

type AttendanceRow = {
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
};

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: "Present",
  absent: "Absent",
  half_day: "Half day",
  leave: "Leave",
};

const STATUS_COLOR: Record<AttendanceStatus, string> = {
  present: "bg-green-100 text-green-800 border-green-300",
  absent: "bg-red-100 text-red-800 border-red-300",
  half_day: "bg-yellow-100 text-yellow-800 border-yellow-300",
  leave: "bg-blue-100 text-blue-800 border-blue-300",
};

export function AttendanceCalendar({
  staffId,
  attendance,
  initialMonth,
}: {
  staffId: string;
  attendance: AttendanceRow[];
  initialMonth: string; // YYYY-MM
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

  // generate prev/next month
  const prevMonth = () => {
    const d = new Date(year, monthNum - 2, 1);
    setMonth(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    );
    router.push(`?month=${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const nextMonth = () => {
    const d = new Date(year, monthNum, 1);
    setMonth(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    );
    router.push(`?month=${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  // counts
  let present = 0,
    absent = 0,
    half = 0,
    leave = 0;
  attendance.forEach((r) => {
    if (r.status === "present") present++;
    else if (r.status === "absent") absent++;
    else if (r.status === "half_day") half++;
    else if (r.status === "leave") leave++;
  });

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(i);

  return (
    <div className="card-soft">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={prevMonth} disabled={pending}>
            Previous
          </Button>
          <div className="font-semibold text-lg min-w-[140px] text-center">
            {new Date(year, monthNum - 1, 1).toLocaleString("en-PK", {
              month: "long",
              year: "numeric",
            })}
          </div>
          <Button variant="outline" onClick={nextMonth} disabled={pending}>
            Next
          </Button>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="px-2 py-1 rounded bg-green-100 text-green-800">
            Present {present}
          </span>
          <span className="px-2 py-1 rounded bg-red-100 text-red-800">
            Absent {absent}
          </span>
          <span className="px-2 py-1 rounded bg-yellow-100 text-yellow-800">
            Half {half}
          </span>
          <span className="px-2 py-1 rounded bg-blue-100 text-blue-800">
            Leave {leave}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2 text-xs font-medium text-muted-foreground mb-2">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="text-center">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {cells.map((day, i) => {
          if (day === null)
            return <div key={`e-${i}`} className="h-24" />;
          const dateStr = `${year}-${String(monthNum).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const status = map.get(dateStr);
          const isToday = dateStr === today;
          return (
            <div
              key={dateStr}
              className={cn(
                "border rounded-lg p-2 h-24 flex flex-col justify-between text-sm",
                isToday && "ring-2 ring-primary",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">{day}</span>
                {status && (
                  <span
                    className={cn(
                      "text-[10px] px-1.5 rounded border",
                      STATUS_COLOR[status],
                    )}
                  >
                    {STATUS_LABELS[status][0]}
                  </span>
                )}
              </div>
              <Select
                value={status ?? ""}
                onValueChange={(v) =>
                  setStatus(dateStr, v as AttendanceStatus)
                }
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue placeholder="—" />
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
  );
}
