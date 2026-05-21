// Pulse BMS — Report skeleton fallback.
//
// Rendered inside the <Suspense> boundary on every report page while the
// inner async server component fetches its data. Mirrors the real
// layout (subtitle, filter bar, white printed-document table) so the
// visual jump when data streams in is minimal.
//
// Server-renderable: no client hooks, no event handlers. Pure markup +
// Tailwind animate-pulse. Lives below the outer chrome (page heading +
// tabs) which is rendered SYNCHRONOUSLY by the page so tab switching
// paints instantly.

export function ReportSkeleton() {
  return (
    <div className="space-y-5">
      {/* Report subtitle skeleton (mimics h2 + tagline) */}
      <div className="space-y-2">
        <div className="h-6 w-48 rounded bg-muted/40 animate-pulse" />
        <div className="h-4 w-72 rounded bg-muted/30 animate-pulse" />
      </div>

      {/* Filter bar skeleton — matches the card-soft layout */}
      <div className="card-soft space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="h-10 w-44 rounded-md bg-muted/40 animate-pulse" />
          <div className="h-10 w-40 rounded-md bg-muted/40 animate-pulse" />
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="h-9 w-36 rounded-md bg-muted/40 animate-pulse" />
          <div className="flex gap-2">
            <div className="h-9 w-20 rounded-md bg-muted/40 animate-pulse" />
            <div className="h-9 w-20 rounded-md bg-muted/40 animate-pulse" />
          </div>
        </div>
      </div>

      {/* Table skeleton — white printed-doc style to match the real preview. */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="h-12 bg-gray-100 border-b border-gray-200" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-11 border-b border-gray-100 last:border-0 flex items-center px-3 gap-4"
          >
            <div className="h-3.5 w-24 rounded bg-gray-200 animate-pulse" />
            <div className="h-3.5 w-32 rounded bg-gray-200 animate-pulse" />
            <div className="h-3.5 w-20 rounded bg-gray-200 animate-pulse ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
