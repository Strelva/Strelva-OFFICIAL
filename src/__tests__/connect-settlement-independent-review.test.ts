import { expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { readPlatformSettlement } from "@/platform/connect/settlement";

function providerFixture() {
  const original = { id: "txn_Original", object: "balance_transaction", source: "ch_RestoredSource", amount: 1000, fee: 50, net: 950, currency: "cad", status: "available", type: "charge" };
  const dispute = { id: "dp_Won", object: "dispute", charge: "ch_RestoredSource", livemode: false, amount: 1000, currency: "cad", status: "won", evidence_details: { submission_count: 0 }, balance_transactions: [
    { id: "txn_Withdrawn", object: "balance_transaction", source: "dp_Won", amount: -1000, fee: 15, net: -1015, currency: "cad", status: "available", type: "adjustment" },
    { id: "txn_Reinstated", object: "balance_transaction", source: "dp_Won", amount: 1000, fee: 0, net: 1000, currency: "cad", status: "available", type: "adjustment" },
  ] };
  const provider = {
    charges: { retrieve: async () => ({
      id: "ch_RestoredSource", object: "charge", currency: "cad", livemode: false,
      amount: 1000, amount_captured: 1000, amount_refunded: 0, disputed: true, paid: true, captured: true,
      balance_transaction: original,
    }) },
    disputes: { list: () => ({ async *[Symbol.asyncIterator]() {
      yield dispute;
    } }) },
    transfers: { list: () => ({ async *[Symbol.asyncIterator]() {} }) },
    refunds: { list: () => ({ async *[Symbol.asyncIterator]() {} }) },
  };
  return { original, dispute, stripe: provider as unknown as Stripe };
}
const database = () => ({ rpc: vi.fn(async () => ({ data: [], error: null })) });

it("a won historical dispute uses actual reinstatement net and retains the provider dispute fee", async () => {
  expect(await readPlatformSettlement(providerFixture().stripe, database(), "ch_RestoredSource"))
    .toEqual({ settled: true, currency: "cad", availableCents: 935 });
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
