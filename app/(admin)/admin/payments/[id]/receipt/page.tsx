import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { loadReceiptData, maybeLogReceiptView } from "@/lib/receipts";
import { ReceiptPageInner } from "@/components/payments/receipt-page-inner";

export const dynamic = "force-dynamic";

/**
 * Admin-scoped printable receipt page. Open in a new tab from anywhere a
 * payment row appears in admin (payments list, maintenance list, flat
 * detail, etc.). The loader scopes to the caller's `building_id` so an
 * admin from Building B can't render Building A's receipts (cross-tenant
 * probe returns 404).
 */
export default async function AdminReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  if (!profile.building_id) notFound();

  const result = await loadReceiptData(id, profile.building_id);
  if (!result) notFound();

  // Debounced audit log — `maybeLogReceiptView` drops a 60s scoped cookie
  // per payment so refreshes / print-preview / tab-reopens don't spam
  // bms_audit_log with duplicate `receipt.view` rows.
  await maybeLogReceiptView({
    payment_id: id,
    user_id: user.id,
    user_email: user.email,
    role: profile.role,
    building_id: profile.building_id,
  });

  return <ReceiptPageInner receipt={result.data} showLegacyReference />;
}
