import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn, formatDate, formatRelative, capitalize } from "@/lib/utils";
import { TableSkeleton } from "@/components/layout/table-skeleton";
import { Pin, Megaphone } from "lucide-react";

export const dynamic = "force-dynamic";

type NoticeRow = {
  id: string;
  title: string;
  body: string;
  notice_type: string | null;
  pinned: boolean | null;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
  bms_profiles:
    | { full_name: string | null; email: string | null }
    | { full_name: string | null; email: string | null }[]
    | null;
};

const TYPE_COLOR: Record<string, string> = {
  general:     "text-muted-foreground",
  maintenance: "text-[hsl(38_92%_65%)]",
  urgent:      "text-destructive",
  meeting:     "text-[hsl(210_90%_70%)]",
  event:       "text-[hsl(151_70%_55%)]",
};

export default async function ResidentNoticesPage() {
  const { profile } = await requireRole("resident");

  return (
    <div className="space-y-5 animate-fade-up max-w-3xl">
      <header>
        <h1>Notices</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Updates from your building admin and union.
        </p>
      </header>

      <Suspense fallback={<TableSkeleton rows={4} />}>
        <NoticesList buildingId={profile.building_id} />
      </Suspense>
    </div>
  );
}

async function NoticesList({ buildingId }: { buildingId: string | null }) {
  if (!buildingId) return null;
  const supabase = await createClient();

  const { data } = await supabase
    .from("bms_notices")
    .select(
      "id, title, body, notice_type, pinned, expires_at, created_by, created_at, bms_profiles:created_by(full_name, email)",
    )
    .eq("building_id", buildingId)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });
  const notices = (data ?? []) as unknown as NoticeRow[];

  const now = Date.now();
  const active = notices.filter(
    (n) => !n.expires_at || new Date(n.expires_at).getTime() > now,
  );

  if (active.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <Megaphone className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Nothing new to share.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {active.map((n) => {
        const creator = Array.isArray(n.bms_profiles) ? n.bms_profiles[0] : n.bms_profiles;
        const creatorName = creator?.full_name ?? creator?.email ?? "Admin";
        const typeKey = (n.notice_type ?? "general").toLowerCase();
        const typeColor = TYPE_COLOR[typeKey] ?? "text-muted-foreground";
        return (
          <article
            key={n.id}
            className={cn(
              "rounded-lg border bg-card p-4 transition-colors",
              n.pinned
                ? "border-primary/40 shadow-[0_0_30px_-18px_hsl(38_92%_55%/0.4)]"
                : "border-border hover:border-border/80",
            )}
          >
            <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
              <h3 className="text-base font-semibold tracking-tight flex items-center gap-2">
                {n.pinned && <Pin className="w-3.5 h-3.5 text-primary shrink-0" />}
                <span className="line-clamp-2">{n.title}</span>
              </h3>
            </div>
            <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className={typeColor}>
                {capitalize(n.notice_type ?? "General")}
              </span>
              <span>·</span>
              <span>{creatorName}</span>
              <span>·</span>
              <span>{formatRelative(n.created_at)}</span>
              {n.expires_at && (
                <>
                  <span>·</span>
                  <span>expires {formatDate(n.expires_at)}</span>
                </>
              )}
            </div>
            <div className="mt-3 text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
              {n.body}
            </div>
          </article>
        );
      })}
    </div>
  );
}
