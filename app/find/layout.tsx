// Top-level public layout — no auth required. /find is the marketplace.
// We deliberately don't render the AppShell sidebar here so unsigned visitors
// see a clean discovery experience.

export default function FindLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      {children}
    </div>
  );
}
