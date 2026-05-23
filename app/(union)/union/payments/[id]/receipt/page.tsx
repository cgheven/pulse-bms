import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { loadReceiptData, maybeLogReceiptView } from "@/lib/receipts";
import { ReceiptPageInner } from "@/components/payments/receipt-page-inner";

export const dynamic = "force-dynamic";

/**
 * Union-scoped printable receipt page. Union committee officers
 * (Treasurer / Secretary / VP) record payments from the collections
 * desk and need to hand a receipt to the resident on the spot.
 *
 * Admin + super_admin are also allowed so the same URL works from any
 * role escalation path. Read-only — receipts aren't editable from this
 * page in v1.
 */
export default async function UnionReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile, user } = await requireRole(["union", "admin", "super_admin"]);
  if (!profile.building_id) notFound();

  const result = await loadReceiptData(id, profile.building_id);
  if (!result) notFound();

  await maybeLogReceiptView({
    payment_id: id,
    user_id: user.id,
    user_email: user.email,
    role: profile.role,
    building_id: profile.building_id,
  });

  return <ReceiptPageInner receipt={result.data} showLegacyReference />;
}
