import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generatePlatformInvoicePDF } from "@/lib/platform-invoice-pdf";
import type { PlatformInvoice, PlatformInvoiceStatus } from "@/types";

/**
 * PUBLIC, UNAUTHENTICATED invoice PDF.
 *
 *   GET /invoice/<share_token>  ->  200 application/pdf   (inline)
 *                               ->  404 text/plain        (anything else)
 *
 * This is the link PulseHub sends a client over WhatsApp/email. The client is
 * a building owner, not a Pulse user — they have no session and never will —
 * so the random UUID in the URL IS the credential. Consequences, all deliberate:
 *
 *  - It lives at top-level /app/invoice, OUTSIDE every authenticated route
 *    group, and is allowlisted in lib/supabase/middleware.ts. Without that
 *    allowlist the middleware 307s anonymous requests to /login and every
 *    shared invoice link is dead.
 *  - It reads with the SERVICE-ROLE client (there is no session to run RLS
 *    against). That makes the token the only access control, so the handler
 *    accepts exactly ONE piece of user input — the token — and never anything
 *    that could widen the query.
 *  - Every unhappy path returns the SAME generic 404 with the same body, so a
 *    scanner cannot tell "malformed token" from "no such invoice" from
 *    "invoice deleted". No timing defence is attempted or needed: guessing a
 *    122-bit random UUID is not a feasible attack.
 *  - The response is marked private/no-store so no shared CDN or proxy can
 *    ever hand one client's invoice to another.
 */

// Service role + jsPDF (which touches the filesystem for the logo) need Node,
// not the edge runtime. force-dynamic because the token is per-request and the
// result must never be statically cached or prerendered.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The token must be a full UUID — the exact shape Postgres generates for
 * bms_platform_invoices.share_token (gen_random_uuid()). Rejecting anything
 * else before touching the DB means enumeration attempts, path-fuzzing and
 * SQL-shaped junk never reach Supabase, and avoids the 22P02 "invalid input
 * syntax for type uuid" error that a non-UUID .eq() on a uuid column raises.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One response for every failure mode — never reveals which one occurred. */
function notFound() {
  return new NextResponse("This invoice link is not valid.", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  if (!token || !UUID_RE.test(token)) {
    return notFound();
  }

  const admin = createAdminClient();

  // Matched on share_token ONLY. An invoice id is also a uuid and would pass
  // the regex above, but it can never match this column — the id is exposed in
  // the super-admin UI and must not double as a share credential.
  // Never log `token`; it is a bearer credential.
  const { data: row, error } = await admin
    .from("bms_platform_invoices")
    .select("*")
    .eq("share_token", token)
    .maybeSingle();

  if (error || !row) {
    return notFound();
  }

  // Everything the PDF renders comes from this row's pricing SNAPSHOT
  // (flats_count, standard_monthly_rate, monthly_rate, discount_pct,
  // standard_amount, subscription_amount, onboarding_fee_charged,
  // is_first_invoice, amount) — frozen at generation time. Nothing is
  // recomputed here, so a historical invoice stays accurate even after the
  // building adds flats, the tier table is repriced, or the deal is
  // renegotiated. Do not "improve" this by calling the pricing helpers.
  //
  // numeric(12,2) arrives from PostgREST as a JSON number, but coerce anyway
  // so a driver/serialisation change can never feed the renderer a string.
  const invoice: PlatformInvoice = {
    id:                     row.id,
    invoice_no:             row.invoice_no,
    building_id:            row.building_id,
    billing_period_start:   row.billing_period_start,
    billing_period_end:     row.billing_period_end,
    period_label:           row.period_label,
    billing_cycle:          row.billing_cycle as "monthly" | "annual",
    flats_count:            Number(row.flats_count),
    standard_monthly_rate:  Number(row.standard_monthly_rate),
    monthly_rate:           Number(row.monthly_rate),
    discount_pct:           Number(row.discount_pct),
    standard_amount:        Number(row.standard_amount),
    subscription_amount:    Number(row.subscription_amount),
    onboarding_fee_charged: Number(row.onboarding_fee_charged),
    is_first_invoice:       Boolean(row.is_first_invoice),
    amount:                 Number(row.amount),
    status:                 row.status as PlatformInvoiceStatus,
    issue_date:             row.issue_date,
    due_date:               row.due_date,
    paid_at:                row.paid_at,
    marked_paid_by:         row.marked_paid_by,
    share_token:            row.share_token,
    notes:                  row.notes,
    created_at:             row.created_at,
    updated_at:             row.updated_at,
  };

  // "BILLED TO" contact. bms_client_billing.contact_* is denormalised on
  // purpose (the invoice is addressed to a named human who is not necessarily
  // the current building admin); fall back to the building's active admin
  // profile, then to a neutral placeholder. Both queries are scoped by ids
  // taken from the invoice row — never from the request.
  const [{ data: billing }, { data: building }, { data: adminProfile }] =
    await Promise.all([
      admin
        .from("bms_client_billing")
        .select("contact_name, contact_email, contact_phone")
        .eq("building_id", invoice.building_id)
        .maybeSingle(),
      admin
        .from("bms_buildings")
        .select("name")
        .eq("id", invoice.building_id)
        .maybeSingle(),
      admin
        .from("bms_profiles")
        .select("full_name, email, phone")
        .eq("building_id", invoice.building_id)
        .eq("role", "admin")
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

  const buildingName: string = building?.name ?? "Client Building";

  const pdfBytes = generatePlatformInvoicePDF(invoice, {
    building_name: buildingName,
    name:  billing?.contact_name  ?? adminProfile?.full_name ?? buildingName,
    email: billing?.contact_email ?? adminProfile?.email     ?? null,
    phone: billing?.contact_phone ?? adminProfile?.phone     ?? null,
  });

  // invoice_no is sequence-generated (INV-B0000042) so it is already
  // filename-safe, but strip anything unexpected rather than trusting a DB
  // string inside a header — a stray CR/LF would be header injection.
  const safeNo = invoice.invoice_no.replace(/[^A-Za-z0-9._-]/g, "");
  const filename = `pulse-invoice-${safeNo || "pulse"}.pdf`;

  return new NextResponse(new Uint8Array(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      // inline so WhatsApp/mobile browsers preview it instead of forcing a
      // download; the filename still applies if the client saves it.
      "Content-Disposition": `inline; filename="${filename}"`,
      // private  -> a shared CDN/proxy must never cache this for another client
      // no-store -> not written to disk by intermediaries or the browser cache
      "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff",
      // The URL is a bearer credential; keep it out of search indexes.
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    },
  });
}
