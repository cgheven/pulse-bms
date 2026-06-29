"use client";

import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useDashboardSettings } from "@/hooks/use-dashboard-settings";

type Props = {
  monthLabel: string;
  overview: React.ReactNode;
  maintenancePaid: React.ReactNode;
  salesActivity: React.ReactNode;
  recentAudit: React.ReactNode;
  manageBuildings: React.ReactNode;
};

const TOGGLES = [
  { key: "showOverview",        label: "Overview stats",              hint: "Buildings, flats, residents, dues, fund balance" },
  { key: "showMaintenancePaid", label: "Maintenance paid this month", hint: "Count of flats that paid this month" },
  { key: "showSalesActivity",   label: "Sales activity",              hint: "Leads, follow-ups, won deals" },
  { key: "showRecentAudit",     label: "Recent activity",             hint: "Latest audit log entries" },
] as const;

export function DashboardClientShell({
  monthLabel,
  overview,
  maintenancePaid,
  salesActivity,
  recentAudit,
  manageBuildings,
}: Props) {
  const { settings, update, mounted } = useDashboardSettings();

  // Render with defaults before localStorage resolves to avoid layout shift.
  const s = mounted ? settings : {
    showOverview: true,
    showMaintenancePaid: true,
    showSalesActivity: true,
    showRecentAudit: true,
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1>Super Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cross-building overview · {monthLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5">
                <Settings2 className="w-4 h-4" />
                Customise
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-4">
              <p className="text-sm font-semibold text-foreground mb-3">
                Show on dashboard
              </p>
              <div className="space-y-3">
                {TOGGLES.map(({ key, label, hint }) => (
                  <label
                    key={key}
                    className="flex items-start gap-3 cursor-pointer group"
                  >
                    <input
                      type="checkbox"
                      checked={s[key]}
                      onChange={(e) => update({ [key]: e.target.checked })}
                      className="mt-0.5 h-4 w-4 rounded border-border accent-primary cursor-pointer"
                    />
                    <div>
                      <p className="text-sm font-medium text-foreground leading-tight">
                        {label}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {hint}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          {manageBuildings}
        </div>
      </div>

      {s.showOverview && overview}
      {s.showMaintenancePaid && maintenancePaid}
      {s.showSalesActivity && salesActivity}
      {s.showRecentAudit && recentAudit}
    </div>
  );
}
