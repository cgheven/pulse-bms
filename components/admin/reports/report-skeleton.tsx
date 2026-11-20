// Pulse BMS — Report skeleton fallback.
//
// Rendered inside the <Suspense> boundary on every report page while the
// inner async server component fetches its data. Mirrors the real layout
// (subtitle, filter bar, table) using the app's DARK card tokens.
//
// The report preview itself is a white "printed-document" (ReportTable is
// bg-white), but the skeleton is deliberately DARK: a big white block while
// data is still loading reads as a flash on the dark app — a white
// half-screen that then "settles." The white document should appear only
// once it is real content, not as a loading placeholder. (The Summary tab
// has its own card-shaped dark skeleton; this one serves the table tabs.)
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

      {/* Table skeleton — dark card tokens (not the white document) so no
          white block paints while data is still loading. */}
      <div className="rounded-xl border border-border bg-card shadow-lg overflow-hidden">
        <div className="h-12 bg-secondary/60 border-b border-border" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-11 border-b border-border last:border-0 flex items-center px-3 gap-4"
          >
            <div className="h-3.5 w-24 rounded bg-secondary/50 animate-pulse" />
            <div className="h-3.5 w-32 rounded bg-secondary/40 animate-pulse" />
            <div className="h-3.5 w-20 rounded bg-secondary/40 animate-pulse ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
