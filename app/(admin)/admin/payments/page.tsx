import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * /admin/payments has been merged into /admin/maintenance (Payments tab).
 * Preserved as a redirect so old bookmarks and external links still land
 * users on the right tab. Forwards all incoming query params (e.g. `?focus=…`)
 * so deep links keep working — same pattern as the legacy /admin/billing
 * redirect.
 */
export default async function LegacyPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams({ tab: "payments" });
  for (const [k, v] of Object.entries(sp)) {
    if (k === "tab") continue;
    if (typeof v === "string") qs.set(k, v);
  }
  redirect(`/admin/maintenance?${qs.toString()}`);
}
