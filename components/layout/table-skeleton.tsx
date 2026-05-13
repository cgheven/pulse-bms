/**
 * Inline table skeleton — used inside <Suspense fallback={...}> in page components.
 * Renders immediately while the async data component fetches in the background.
 * Header bar + 6 rows. Width-flexible.
 */
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-lg overflow-hidden animate-fade-in">
      <div className="bg-secondary/60 border-b border-border h-11" />
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 px-3 py-3 border-b border-border last:border-0"
        >
          <div className="h-4 w-20 rounded bg-secondary/50 animate-pulse shrink-0" />
          <div className="h-4 flex-1 rounded bg-secondary/40 animate-pulse" />
          <div className="h-4 w-24 rounded bg-secondary/40 animate-pulse hidden sm:block" />
          <div className="h-4 w-20 rounded bg-secondary/40 animate-pulse hidden md:block" />
          <div className="h-4 w-16 rounded bg-secondary/40 animate-pulse hidden md:block" />
        </div>
      ))}
    </div>
  );
}

/**
 * KPI row skeleton — for use above a table or as standalone KPI placeholder.
 */
export function KpiRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div
      className={`grid grid-cols-2 ${count >= 4 ? "md:grid-cols-4" : "md:grid-cols-3"} gap-3 animate-fade-in`}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-4">
          <div className="h-3 w-20 rounded bg-secondary/50 animate-pulse" />
          <div className="mt-2 h-7 w-24 rounded bg-secondary/60 animate-pulse" />
        </div>
      ))}
    </div>
  );
}
