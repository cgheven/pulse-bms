"use client";

// Global error boundary. Catches uncaught errors thrown during a render
// (including server-action throws that escape per-form try/catch).
// We never show the raw error to the user — Next.js may include scrubbed
// internals like "Server Components render..." and digest hints, both of
// which leak implementation detail and confuse senior residents.

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep raw error in dev console for debugging.
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="card-soft max-w-md w-full text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-semibold">Something went wrong</h2>
        <p className="text-muted-foreground text-sm">
          We hit an unexpected error. Please try again, and if the problem
          persists, contact your admin.
        </p>
        <Button onClick={reset} className="btn-big">
          Try again
        </Button>
      </div>
    </div>
  );
}
