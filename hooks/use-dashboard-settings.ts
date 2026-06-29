"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "pulse_sa_dash_v1";

export type DashboardSettings = {
  showOverview: boolean;
  showMaintenancePaid: boolean;
  showSalesActivity: boolean;
  showRecentAudit: boolean;
};

const DEFAULTS: DashboardSettings = {
  showOverview: true,
  showMaintenancePaid: true,
  showSalesActivity: true,
  showRecentAudit: true,
};

export function useDashboardSettings() {
  const [settings, setSettings] = useState<DashboardSettings>(DEFAULTS);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        // Whitelist only the known boolean keys — prevents prototype-pollution
        // or unexpected keys from ever entering state.
        setSettings({
          showOverview:        typeof p.showOverview        === "boolean" ? p.showOverview        : DEFAULTS.showOverview,
          showMaintenancePaid: typeof p.showMaintenancePaid === "boolean" ? p.showMaintenancePaid : DEFAULTS.showMaintenancePaid,
          showSalesActivity:   typeof p.showSalesActivity   === "boolean" ? p.showSalesActivity   : DEFAULTS.showSalesActivity,
          showRecentAudit:     typeof p.showRecentAudit     === "boolean" ? p.showRecentAudit     : DEFAULTS.showRecentAudit,
        });
      }
    } catch {
      // Corrupt/unavailable storage — fall back to defaults silently.
    }
    setMounted(true);
  }, []);

  const update = useCallback((patch: Partial<DashboardSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Storage quota exceeded or private mode — state still updates in memory.
      }
      return next;
    });
  }, []);

  return { settings, update, mounted };
}
