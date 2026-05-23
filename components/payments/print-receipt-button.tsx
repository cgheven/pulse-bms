"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Minimal client-side wrapper around `window.print()` so the receipt
 * page server component stays server-rendered (no "use client" needed).
 * The print CSS in globals.css scopes to `.receipt-page` so chrome is
 * automatically hidden.
 */
export function PrintReceiptButton() {
  return (
    <Button variant="outline" onClick={() => window.print()}>
      <Printer className="w-4 h-4 mr-2" />
      Print
    </Button>
  );
}
