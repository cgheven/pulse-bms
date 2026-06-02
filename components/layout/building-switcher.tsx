"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { switchBuilding } from "@/app/actions/switch-building";

interface BuildingSwitcherProps {
  buildings: { id: string; name: string; is_primary: boolean }[];
  activeBuildingId: string | null;
  activeBuildingName: string;
}

export function BuildingSwitcher({
  buildings,
  activeBuildingId,
  activeBuildingName,
}: BuildingSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [switchError, setSwitchError] = useState<string | null>(null);
  const router = useRouter();

  // Single building — show name only, no switcher needed
  if (buildings.length <= 1) {
    return (
      <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted-foreground truncate max-w-[180px]">
        <Building2 className="w-3.5 h-3.5 shrink-0 text-primary/70" />
        <span className="truncate">{activeBuildingName}</span>
      </span>
    );
  }

  const activeIndex = buildings.findIndex((b) => b.id === activeBuildingId);
  const displayIndex = activeIndex === -1 ? 1 : activeIndex + 1;

  function handleSwitch(buildingId: string) {
    if (buildingId === activeBuildingId) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      try {
        await switchBuilding(buildingId);
        setOpen(false);
        router.refresh();
      } catch (e: any) {
        setSwitchError(e.message ?? "Failed to switch building.");
      }
    });
  }

  return (
    <div className="relative">
      <button
        onClick={() => { setSwitchError(null); setOpen((p) => !p); }}
        disabled={pending}
        className={cn(
          "hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg",
          "text-xs text-muted-foreground hover:text-foreground hover:bg-white/5",
          "transition-colors max-w-[220px] disabled:opacity-60",
        )}
      >
        <Building2 className="w-3.5 h-3.5 shrink-0 text-primary" />
        <span className="truncate font-medium">
          {pending ? "Switching…" : activeBuildingName}
        </span>
        <span className="text-[10px] text-muted-foreground/50 tabular-nums shrink-0">
          {displayIndex} / {buildings.length}
        </span>
        <ChevronDown
          className={cn(
            "w-3 h-3 shrink-0 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-2 w-64 z-20 rounded-xl border border-sidebar-border bg-sidebar shadow-2xl overflow-hidden">
            <div className="px-3 py-2 border-b border-sidebar-border">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Buildings &nbsp;·&nbsp; {buildings.length}
              </p>
            </div>
            <ul className="p-1 max-h-64 overflow-y-auto">
              {buildings.map((b) => (
                <li key={b.id}>
                  <button
                    onClick={() => handleSwitch(b.id)}
                    disabled={pending}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg",
                      "text-sm hover:bg-white/5 transition-colors text-left",
                      "disabled:opacity-60",
                    )}
                  >
                    <Building2
                      className={cn(
                        "w-4 h-4 shrink-0",
                        b.id === activeBuildingId
                          ? "text-primary"
                          : "text-muted-foreground",
                      )}
                    />
                    <span className="flex-1 truncate text-foreground">{b.name}</span>
                    {b.is_primary && b.id !== activeBuildingId && (
                      <span className="text-[10px] text-muted-foreground/50 shrink-0">
                        primary
                      </span>
                    )}
                    {b.id === activeBuildingId && (
                      <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
            {switchError && (
              <div className="px-3 pb-2">
                <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-2 py-1.5">
                  {switchError}
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
