/**
 * Shared loading skeleton for instant route-transition feedback.
 * Mimics the page header + KPI row + table to feel like content is already there.
 */
export function PageSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2 flex-1">
          <div className="h-9 w-48 rounded-md bg-secondary/60 animate-pulse" />
          <div className="h-4 w-72 rounded-md bg-secondary/40 animate-pulse" />
        </div>
        <div className="h-10 w-32 rounded-md bg-secondary/60 animate-pulse" />
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-border bg-card p-5"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="h-3 w-20 rounded-md bg-secondary/50 animate-pulse" />
            <div className="mt-2 h-8 w-24 rounded-md bg-secondary/60 animate-pulse" />
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card shadow-lg overflow-hidden">
        <div className="bg-secondary/60 border-b border-border h-11" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-3 py-4 border-b border-border last:border-0"
          >
            <div className="h-4 w-24 rounded bg-secondary/50 animate-pulse shrink-0" />
            <div className="h-4 flex-1 rounded bg-secondary/40 animate-pulse" />
            <div className="h-4 w-20 rounded bg-secondary/40 animate-pulse hidden sm:block" />
            <div className="h-4 w-16 rounded bg-secondary/40 animate-pulse hidden md:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
