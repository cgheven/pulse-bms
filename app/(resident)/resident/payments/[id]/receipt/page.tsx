import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadReceiptData, maybeLogReceiptView } from "@/lib/receipts";
import { ReceiptPageInner } from "@/components/payments/receipt-page-inner";

export const dynamic = "force-dynamic";

/**
 * Resident-scoped printable receipt page. Residents can only see
 * receipts for payments tied to a flat they're an ACTIVE resident on —
 * accessing someone else's payment_id in the URL returns notFound().
 *
 * The flat-scope check is done here (the shared `loadReceiptData`
 * loader only enforces building-scope; the resident-specific gate
 * lives at the route layer where session state is available).
 */
export default async function ResidentReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile, user } = await requireRole([
    "resident",
    "admin",
    "super_admin",
    "union",
  ]);
  if (!profile.building_id) notFound();

  const result = await loadReceiptData(id, profile.building_id);
  if (!result) notFound();

  // ── Resident self-only gate ──────────────────────────────────
  // Admin / super_admin / union escalations bypass the gate (they may
  // be debugging a resident's view). For role === "resident" we resolve
  // the active flat list from bms_residents and ensure the payment's
  // flat_id is in that set. The original `resident_id` snapshot may be
  // null on legacy rows so we anchor on flat_id which is reliable.
  if (profile.role === "resident") {
    const supabase = await createClient();
    const { data: rows } = await supabase
      .from("bms_residents")
      .select("flat_id")
      .eq("profile_id", profile.id)
      .eq("building_id", profile.building_id)
      .eq("is_active", true);
    const flatIds = new Set(
      (rows ?? []).map((r) => (r as { flat_id: string }).flat_id),
    );
    if (!result.payment_row.flat_id || !flatIds.has(result.payment_row.flat_id)) {
      notFound();
    }
  }

  await maybeLogReceiptView({
    payment_id: id,
    user_id: user.id,
    user_email: user.email,
    role: profile.role,
    building_id: profile.building_id,
  });

  return <ReceiptPageInner receipt={result.data} />;
}
