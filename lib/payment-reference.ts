import { PAYMENT_MODE } from "@/types";

/**
 * What `bms_payments.reference_no` is called, per payment mode.
 *
 * Every mode writes the same column — a payment carries exactly one
 * reference, and it is a transaction ID *or* a cheque number, never both.
 * A second column would only split the same data across two lookalike
 * fields. So the storage is shared and the wording moves.
 *
 * Both the form mode and the stored mode are accepted, because they are NOT
 * the same vocabulary: the dialog offers `bank_transfer` and `other`, while
 * the DB CHECK constraint allows only
 * `cash | bank | online | cheque | credit_carryforward` — recordPayment maps
 * bank_transfer -> bank and other -> cash on the way in. The receipt reads
 * the stored value, the form holds the unmapped one, and both land here.
 *
 * credit_carryforward deliberately falls through to "Reference": that mode
 * stores the *parent receipt number* of an auto-applied overpayment, which
 * is not a transaction ID.
 */
export function paymentReferenceLabel(mode: string | null | undefined): string {
  switch (mode) {
    case PAYMENT_MODE.BANK_TRANSFER:
    case PAYMENT_MODE.BANK:
    case PAYMENT_MODE.ONLINE:
      return "Transaction ID";
    case PAYMENT_MODE.CHEQUE:
      return "Cheque number";
    default:
      return "Reference";
  }
}

/** Input placeholder matching {@link paymentReferenceLabel}. */
export function paymentReferencePlaceholder(
  mode: string | null | undefined,
): string {
  switch (mode) {
    case PAYMENT_MODE.BANK_TRANSFER:
    case PAYMENT_MODE.BANK:
      return "Bank transaction ID";
    case PAYMENT_MODE.ONLINE:
      return "App or gateway transaction ID";
    case PAYMENT_MODE.CHEQUE:
      return "Number on the cheque";
    default:
      return "Slip or voucher number";
  }
}
