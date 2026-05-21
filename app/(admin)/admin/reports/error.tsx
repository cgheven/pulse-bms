"use client";

// Scoped error boundary for /admin/reports/*. Without this, a Supabase
// fetch failure or a malformed `?from=` param inside the Suspense boundary
// bubbles up to the global app/error.tsx and tears down the entire admin
// shell — including the side nav. Local boundary keeps the admin tree
// intact and offers a single-card retry that reruns the RSC fetch.

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function ReportsError({
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
    <div className="card-soft max-w-md text-center space-y-4 mx-auto">
      <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
        <AlertTriangle className="w-6 h-6" />
      </div>
      <h2 className="text-xl font-semibold">Couldn’t load this report</h2>
      <p className="text-muted-foreground text-sm">
        Something went wrong fetching the data. Please try again, and if it
        keeps happening let your admin know.
      </p>
      <Button onClick={reset} className="btn-big">
        Try again
      </Button>
    </div>
  );
}
