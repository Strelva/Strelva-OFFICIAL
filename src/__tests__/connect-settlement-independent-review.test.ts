import { expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { readPlatformSettlement } from "@/platform/connect/settlement";

function providerFixture() {
  const original = { id: "txn_Original", object: "balance_transaction", source: "ch_RestoredSource", amount: 1000, fee: 50, net: 950, currency: "cad", status: "available", type: "charge" };
  const dispute = { id: "dp_Won", object: "dispute", charge: "ch_RestoredSource", livemode: false, amount: 1000, currency: "cad", status: "won", evidence_details: { submission_count: 0 }, balance_transactions: [
    { id: "txn_Withdrawn", object: "balance_transaction", source: "dp_Won", amount: -1000, fee: 15, net: -1015, currency: "cad", status: "available", type: "adjustment" },
    { id: "txn_Reinstated", object: "balance_transaction", source: "dp_Won", amount: 1000, fee: 0, net: 1000, currency: "cad", status: "available", type: "adjustment" },
  ] };
  const charge = {
    id: "ch_RestoredSource", object: "charge", currency: "cad", livemode: false,
    amount: 1000, amount_captured: 1000, amount_refunded: 0, disputed: true, paid: true, captured: true,
    balance_transaction: original,
  };
  const refunds: Array<{ id: string; charge: string; amount: number; currency: string; status: string; balance_transaction: typeof original | null; failure_balance_transaction: typeof original | null }> = [];
  const provider = {
    charges: { retrieve: async () => charge },
    disputes: { list: () => ({ async *[Symbol.asyncIterator]() {
      yield dispute;
    } }) },
    transfers: { list: () => ({ async *[Symbol.asyncIterator]() {} }) },
    refunds: { list: () => ({ async *[Symbol.asyncIterator]() { yield* refunds; } }) },
  };
  return { original, dispute, charge, refunds, stripe: provider as unknown as Stripe };
}
const database = () => ({ rpc: vi.fn(async () => ({ data: [], error: null })) });

it("a won historical dispute uses actual reinstatement net and retains the provider dispute fee", async () => {
  expect(await readPlatformSettlement(providerFixture().stripe, database(), "ch_RestoredSource"))
    .toEqual({ settled: true, currency: "cad", availableCents: 935 });
});

it.each([0, -5])("an original fee of %s does not prove complete inline fee settlement", async (fee) => {
  const fixture = providerFixture(); fixture.original.fee = fee; fixture.original.net = 1000 - fee;
  let result;
  try { result = await readPlatformSettlement(fixture.stripe, database(), "ch_RestoredSource"); }
  catch { return; }
  expect(result.settled).toBe(false);
});

it("successful refund uses its actual negative net without subtracting refunded principal twice", async () => {
  const fixture = providerFixture(); fixture.charge.amount_refunded = 200;
  fixture.refunds.push({ id: "re_SourceRefund", charge: "ch_RestoredSource", amount: 200, currency: "cad", status: "succeeded", failure_balance_transaction: null,
    balance_transaction: { ...fixture.original, id: "txn_RefundDebit", source: "re_SourceRefund", amount: -200, fee: 10, net: -210, type: "refund" },
  });
  expect(await readPlatformSettlement(fixture.stripe, database(), "ch_RestoredSource"))
    .toEqual({ settled: true, currency: "cad", availableCents: 725 });
});

it("failed refund retains the actual signed debit and restoration credit once", async () => {
  const fixture = providerFixture();
  fixture.refunds.push({ id: "re_SourceRefund", charge: "ch_RestoredSource", amount: 200, currency: "cad", status: "failed",
    balance_transaction: { ...fixture.original, id: "txn_RefundDebit", source: "re_SourceRefund", amount: -200, fee: 10, net: -210, type: "refund" },
    failure_balance_transaction: { ...fixture.original, id: "txn_RefundFailedCredit", source: "re_SourceRefund", amount: 200, fee: 0, net: 200, type: "refund_failure" },
  });
  expect(await readPlatformSettlement(fixture.stripe, database(), "ch_RestoredSource"))
    .toEqual({ settled: true, currency: "cad", availableCents: 925 });
});

it.each(["under_review", "lost"])("%s disputes never release restoration capacity", async (status) => {
  const fixture = providerFixture(); fixture.dispute.status = status;
  let result;
  try { result = await readPlatformSettlement(fixture.stripe, database(), "ch_RestoredSource"); }
  catch { return; }
  expect(result.settled).toBe(false);
});

it.each(["missing", "pending", "wrong charge", "wrong mode", "wrong currency", "wrong receipt source", "duplicate receipt", "inflated net", "unknown countered fee", "submitted evidence fee"])("%s dispute evidence cannot release restoration capacity", async (caseName) => {
  const fixture = providerFixture();
  if (caseName === "missing") fixture.dispute.balance_transactions = [];
  if (caseName === "pending") fixture.dispute.balance_transactions[1]!.status = "pending";
  if (caseName === "wrong charge") fixture.dispute.charge = "ch_Foreign";
  if (caseName === "wrong mode") fixture.dispute.livemode = true;
  if (caseName === "wrong currency") fixture.dispute.balance_transactions[1]!.currency = "usd";
  if (caseName === "wrong receipt source") fixture.dispute.balance_transactions[1]!.source = "dp_Foreign";
  if (caseName === "duplicate receipt") fixture.dispute.balance_transactions[1]!.id = "txn_Withdrawn";
  if (caseName === "inflated net") { fixture.dispute.balance_transactions[1]!.amount = 1100; fixture.dispute.balance_transactions[1]!.net = 1100; }
  if (caseName === "unknown countered fee") Reflect.deleteProperty(fixture.dispute.evidence_details, "submission_count");
  if (caseName === "submitted evidence fee") fixture.dispute.evidence_details.submission_count = 1;
  let result;
  try { result = await readPlatformSettlement(fixture.stripe, database(), "ch_RestoredSource"); }
  catch { return; }
  expect(result.settled).toBe(false);
});
