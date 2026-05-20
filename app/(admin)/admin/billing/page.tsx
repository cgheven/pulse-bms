import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * /admin/billing has been merged into /admin/maintenance (Invoices tab).
 * Keep this route alive as a permanent redirect so existing bookmarks and
 * the `?focus=<invoice_id>` deep-link from the dues panel both still work.
 */
export default async function LegacyBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string }>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  params.set("tab", "invoices");
  if (sp.focus) params.set("focus", sp.focus);
  redirect(`/admin/maintenance?${params.toString()}`);
}
