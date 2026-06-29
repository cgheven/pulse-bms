"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "pulse_admin_dash_v1";

export type AdminDashboardSettings = {
  showGovernance: boolean;
};

const DEFAULTS: AdminDashboardSettings = {
  showGovernance: false,
};

export function useAdminDashboardSettings() {
  const [settings, setSettings] = useState<AdminDashboardSettings>(DEFAULTS);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        setSettings({
          showGovernance:
            typeof p.showGovernance === "boolean"
              ? p.showGovernance
              : DEFAULTS.showGovernance,
        });
      }
    } catch {
      // Corrupt/unavailable storage — stay on defaults.
    }
    setMounted(true);
  }, []);

  const update = useCallback((patch: Partial<AdminDashboardSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Quota or private mode — update in memory only.
      }
      return next;
    });
  }, []);

  return { settings, update, mounted };
}
