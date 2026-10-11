import type Stripe from "stripe";
import { moneyRpc, type RpcDb } from "./index";
type SourceExpectation = { currency?: string; livemode?: boolean };
const objectId = (value: string | { id: string } | null) => typeof value === "string" ? value : value?.id;
function integer(value: number, label: string, minimum = Number.MIN_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum) throw Error("Settlement " + label + " missing or invalid");
  return value;
}
function add(a: number, b: number) { return integer(a + b, "amount overflow"); }
/** Platform SDK scope only: no connected-account header is supplied. Net
 * receipts establish source capacity; known ledger transfers remain counted
 * by the SQL reservation guard. No provider operation is retried here. */
export async function readPlatformSettlement(stripe: Stripe, db: RpcDb | null, chargeId: string, expected: SourceExpectation = {}) {
  const charge = await stripe.charges.retrieve(chargeId, { expand: ["balance_transaction"] });
  if (charge.id !== chargeId || typeof charge.livemode !== "boolean" || !/^[a-z]{3}$/.test(charge.currency)) throw Error("Settlement charge identity mismatch");
  const configuredMode = process.env.STRIPE_SECRET_KEY?.match(/^(?:sk|rk)_(live|test)_/)?.[1];
  const mode = expected.livemode ?? (configuredMode ? configuredMode === "live" : charge.livemode);
  if (charge.livemode !== mode || (configuredMode && mode !== (configuredMode === "live")) || (expected.currency && expected.currency !== charge.currency)) throw Error("Settlement source mode or currency mismatch");
  if (charge.source_transfer || charge.transfer || charge.transfer_data || charge.on_behalf_of) throw Error("Settlement source is not a standalone platform charge");
  const amount = integer(charge.amount, "charge amount", 1);
  const refunded = integer(charge.amount_refunded, "refund amount", 0);
  if (refunded > amount || typeof charge.disputed !== "boolean") throw Error("Settlement charge financial evidence invalid");
  let settled = charge.paid === true && charge.captured === true;
  const seenReceipts = new Set<string>();
  function receipt(raw: Stripe.BalanceTransaction | string | null | undefined, source: string, gross: number) {
    if (!raw || typeof raw === "string" || !raw.id || seenReceipts.has(raw.id) || objectId(raw.source) !== source || raw.currency !== charge.currency) throw Error("Settlement balance receipt identity mismatch");
    integer(raw.amount, "receipt amount"); integer(raw.fee, "receipt fee"); integer(raw.net, "receipt net");
    if (raw.amount !== gross || raw.net !== raw.amount - raw.fee || !["available", "pending"].includes(raw.status)) throw Error("Settlement balance receipt financial evidence invalid");
    if (raw.status !== "available") settled = false;
    seenReceipts.add(raw.id);
    return raw.net;
  }
  let available = receipt(charge.balance_transaction, charge.id, amount);
  if (available < 0 || available > amount) throw Error("Settlement original net invalid");
  // Standalone pricing can report gross net and zero fee, then debit fees
  // separately later. A zero fee is not evidence of a free payment.
  const original = charge.balance_transaction;
  if (!original || typeof original === "string" || original.fee <= 0) throw Error("Settlement inline processing fee evidence required");
  const disputes = new Set<string>();
  for await (const dispute of stripe.disputes.list({ charge: charge.id, limit: 100 })) {
    if (!dispute.id || disputes.has(dispute.id) || objectId(dispute.charge) !== charge.id || dispute.currency !== charge.currency || dispute.livemode !== mode) throw Error("Settlement dispute identity mismatch");
    disputes.add(dispute.id);
    const principal = integer(dispute.amount, "dispute amount", 1);
    if (!Array.isArray(dispute.balance_transactions)) throw Error("Settlement dispute financial receipts missing");
    if (!charge.disputed && dispute.status === "warning_closed" && dispute.balance_transactions.length === 0) continue;
    if (dispute.status !== "won") { settled = false; continue; }
    // Stripe's separately applied countered fee is absent from these receipts.
    // No submission proves this fee was never charged; any other case needs
    // separate exact financial reconciliation, not a nominal assumed refund.
    if (dispute.evidence_details?.submission_count !== 0) throw Error("Settlement countered fee evidence incomplete");
    // Status alone is no money receipt. The actual withdrawal plus
    // reinstatement keeps nonrefunded provider fees in the source budget.
    if (dispute.balance_transactions.length !== 2) throw Error("Settlement dispute financial receipts missing");
    const withdrawal = dispute.balance_transactions.find(row => row.amount < 0);
    const restoration = dispute.balance_transactions.find(row => row.amount > 0);
    if (!withdrawal || !restoration) throw Error("Settlement dispute restoration missing");
    const debit = receipt(withdrawal, dispute.id, -principal);
    const credit = receipt(restoration, dispute.id, principal);
    const impact = add(debit, credit);
    if (debit >= 0 || credit <= 0 || impact > 0) throw Error("Settlement dispute net inflation");
    available = add(available, impact);
  }
  if (charge.disputed && disputes.size === 0) throw Error("Settlement current dispute evidence missing");
  // Refund principal reconciles the provider view, never a second debit.
  let confirmedRefunds = 0;
  const refunds = new Set<string>();
  for await (const refund of stripe.refunds.list({ charge: charge.id, limit: 100, expand: ["data.balance_transaction", "data.failure_balance_transaction"] })) {
    if (!refund.id || refunds.has(refund.id) || objectId(refund.charge) !== charge.id || refund.currency !== charge.currency) throw Error("Settlement refund identity mismatch");
    refunds.add(refund.id);
    const principal = integer(refund.amount, "refund principal", 1);
    if (refund.status === "pending" || refund.status === "requires_action") { settled = false; continue; }
    if (refund.status === "succeeded") {
      if (refund.failure_balance_transaction) throw Error("Settlement successful refund has conflicting reversal");
      const debit = receipt(refund.balance_transaction, refund.id, -principal);
      if (debit > 0) throw Error("Settlement refund net inflation");
      available = add(available, debit);
      confirmedRefunds = add(confirmedRefunds, principal);
    } else if (refund.status === "failed" || refund.status === "canceled") {
      if (!refund.balance_transaction && !refund.failure_balance_transaction) continue;
      const debit = receipt(refund.balance_transaction, refund.id, -principal);
      const credit = receipt(refund.failure_balance_transaction, refund.id, principal);
      const impact = add(debit, credit);
      if (debit >= 0 || credit <= 0 || impact > 0) throw Error("Settlement failed refund net inflation");
      available = add(available, impact);
    } else throw Error("Settlement refund status unknown");
  }
  if (confirmedRefunds !== refunded) throw Error("Settlement refund receipts incomplete");
  const known = await moneyRpc<string[]>("read_source_transfer_ids", { p_charge: charge.id }, db);
  if (!Array.isArray(known) || known.some(id => typeof id !== "string" || !id.startsWith("tr_"))) throw Error("Settlement ledger transfer evidence invalid");
  const transfers = new Set<string>();
  for await (const transfer of stripe.transfers.list({ limit: 100 })) {
    if (objectId(transfer.source_transaction) !== charge.id) continue;
    if (!transfer.id || transfers.has(transfer.id) || transfer.currency !== charge.currency || transfer.livemode !== mode) throw Error("Settlement transfer identity mismatch");
    transfers.add(transfer.id);
    integer(transfer.amount, "transfer amount", 1); integer(transfer.amount_reversed, "transfer reversal", 0);
    if (transfer.amount_reversed > transfer.amount) throw Error("Settlement transfer reversal invalid");
    if (!known.includes(transfer.id)) available = add(available, -(transfer.amount - transfer.amount_reversed));
  }
  return { settled, currency: charge.currency, availableCents: settled ? Math.max(0, available) : 0 };
}
