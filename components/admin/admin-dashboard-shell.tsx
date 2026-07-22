"use client";

import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAdminDashboardSettings } from "@/hooks/use-admin-dashboard-settings";

type Props = {
  children: React.ReactNode;
  governanceTile: React.ReactNode;
  header: React.ReactNode;
};

export function AdminDashboardShell({ children, governanceTile, header }: Props) {
  const { settings, update, mounted } = useAdminDashboardSettings();
  const showGovernance = mounted ? settings.showGovernance : false;

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>{header}</div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground hover:text-foreground shrink-0 mt-1">
              <Settings2 className="w-3.5 h-3.5" />
              Customise
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-4">
            <p className="text-sm font-semibold text-foreground mb-3">
              Show on dashboard
            </p>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={showGovernance}
                onChange={(e) => update({ showGovernance: e.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-border accent-primary cursor-pointer"
              />
              <div>
                <p className="text-sm font-medium text-foreground leading-tight">
                  Governance
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Pending union votes and proposals
                </p>
              </div>
            </label>
          </PopoverContent>
        </Popover>
      </div>

      {children}

      {showGovernance && governanceTile}
    </>
  );
}
