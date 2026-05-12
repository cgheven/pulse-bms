"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export function AuditMetaCell({ meta }: { meta: unknown }) {
  const [open, setOpen] = useState(false);

  if (meta === null || meta === undefined) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }

  let text: string;
  try {
    text = JSON.stringify(meta, null, 2);
  } catch {
    text = String(meta);
  }

  const isObject = typeof meta === "object";
  if (!isObject) return <span className="text-xs">{text}</span>;

  return (
    <div className="max-w-md">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {open ? "Hide details" : "Show details"}
      </button>
      {open && (
        <pre className="mt-2 p-2 rounded bg-secondary text-xs overflow-x-auto whitespace-pre-wrap break-all">
          {text}
        </pre>
      )}
    </div>
  );
}
