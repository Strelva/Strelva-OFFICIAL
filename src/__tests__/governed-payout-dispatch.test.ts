import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { executeApprovedPayout } from "@/platform/connect/transfers";
import { executeGovernedPayout } from "@/platform/connect/governed-operations";
const id = "11111111-1111-4111-8111-111111111111", userId = "22222222-2222-4222-8222-222222222222";
const payout = { id, recipient_account_id: "acct_Recipient", source_account_id: "platform", source_transaction: "ch_Source", amount_cents: 100, currency: "cad" };
const authority = { actor: { userId, verifiedEmail: "operator@example.test" }, profileVersion: "approved-v1" };
function ports(final: unknown = payout, error: string | null = null, initial: unknown = payout) {
  const create = vi.fn(async () => ({ id: "tr_Accepted", amount: 100, currency: "cad", destination: "acct_Recipient", source_transaction: "ch_Source" }));
  const retrieve = vi.fn(async () => ({ id: "tr_Accepted", amount: 100, currency: "cad", destination: "acct_Recipient", source_transaction: "ch_Source" }));
  const database = { rpc: vi.fn(async (name: string) => ({ data: name === "prepare_approved_split_transfer" ? initial : name === "read_source_transfer_ids" ? [] : name === "assert_governed_payout_dispatch" ? final : null, error: name === "assert_governed_payout_dispatch" && error ? { message: error } : null })) };
  const read = vi.fn(async () => ({ id: "ch_Source", paid: true, captured: true, livemode: false, amount: 1000, amount_refunded: 0, currency: "cad", disputed: false, balance_transaction: { id: "txn_Source", source: "ch_Source", amount: 1000, fee: 100, net: 900, currency: "cad", status: "available" } }));
  const stripe = { charges: { retrieve: read }, disputes: { list: () => ({ async *[Symbol.asyncIterator]() {} }) }, refunds: { list: () => ({ async *[Symbol.asyncIterator]() {} }) }, transfers: { create, retrieve, list: () => ({ async *[Symbol.asyncIterator]() {} }) } } as unknown as Stripe;
  return { database, stripe, create, retrieve, read };
}
beforeEach(() => { vi.stubEnv("STRELVA_SPLIT_PAYOUT_EXECUTION", "1"); });
afterEach(() => vi.unstubAllEnvs());
describe("current operator payout dispatch", () => {
  it("checks actual operator/profile and immutable source after awaited settlement, immediately before transfer", async () => {
    const p = ports(), hook = vi.fn(async () => undefined);
    await executeApprovedPayout(id, { db: p.database, stripe: p.stripe, payoutAuthority: authority, beforeProviderMutation: hook });
    expect(p.database.rpc.mock.calls.map(call => call[0])).toEqual(["prepare_approved_split_transfer", "read_source_transfer_ids", "assert_split_transfer_settlement", "assert_governed_payout_dispatch", "record_split_transfer"]);
    expect(p.database.rpc).toHaveBeenCalledWith("assert_governed_payout_dispatch", { p_payout_id: id, p_user_id: userId, p_verified_email: authority.actor.verifiedEmail, p_profile_version: authority.profileVersion, p_recipient: "acct_Recipient", p_charge: "ch_Source", p_amount: 100, p_currency: "cad", p_available: 900 });
    expect(hook).toHaveBeenCalledOnce(); expect(p.create).toHaveBeenCalledOnce();
  });
  it("refuses new transfer after operator/approval/recipient/accrual withdrawal or final port failure", async () => {
    for (const error of ["governed_money_denied", "governed_money_not_configured", "payout_accrual_changed", "payout_source_balance_changed", "payout_attempt_requires_reconciliation"]) {
      const p = ports(null, error); await expect(executeApprovedPayout(id, { db: p.database, stripe: p.stripe, payoutAuthority: authority })).rejects.toThrow(); expect(p.read).toHaveBeenCalledOnce(); expect(p.create).not.toHaveBeenCalled(); expect(p.database.rpc.mock.calls.some(call => call[0] === "record_split_transfer")).toBe(false);
    }
  });
  it("fails before any provider access on missing actual authority or malformed reservation", async () => {
    for (const initial of [payout, { ...payout, amount_cents: -1 }, { ...payout, id: userId }, { ...payout, source_account_id: "acct_Merchant" }]) {
      const p = ports(payout, null, initial); await expect(executeApprovedPayout(id, { db: p.database, stripe: p.stripe })).rejects.toThrow(); expect(p.read).not.toHaveBeenCalled(); expect(p.create).not.toHaveBeenCalled();
    }
  });
  it("rejects final payout identity substitution before dispatch", async () => {
    for (const changed of [{ id: userId }, { recipient_account_id: "acct_Other" }, { source_transaction: "ch_Other" }, { amount_cents: 101 }, { currency: "usd" }]) {
      const p = ports({ ...payout, ...changed }); await expect(executeApprovedPayout(id, { db: p.database, stripe: p.stripe, payoutAuthority: authority })).rejects.toThrow(); expect(p.create).not.toHaveBeenCalled();
    }
  });
  it("retrieves a parallel accepted effect from final admission without redispatching", async () => {
    const p = ports({ ...payout, transfer_id: "tr_Accepted" });
    await expect(executeApprovedPayout(id, { db: p.database, stripe: p.stripe, payoutAuthority: authority })).resolves.toEqual({ transferId: "tr_Accepted" });
    expect(p.create).not.toHaveBeenCalled(); expect(p.retrieve).toHaveBeenCalledWith("tr_Accepted"); expect(p.database.rpc.mock.calls.at(-1)?.[0]).toBe("record_split_transfer");
  });
  it("records/retrieves an already accepted receipt without new actor admission or settlement fetch", async () => {
    const p = ports(null, "governed_money_denied", { ...payout, transfer_id: "tr_Accepted" });
    await executeApprovedPayout(id, { db: p.database, stripe: p.stripe });
    expect(p.read).not.toHaveBeenCalled(); expect(p.create).not.toHaveBeenCalled(); expect(p.database.rpc.mock.calls.map(call => call[0])).toEqual(["prepare_approved_split_transfer", "record_split_transfer"]);
  });
  it("checks actual execution/profile flags again after the async pre-effect boundary", async () => {
    for (const withdrawn of ["STRELVA_WORKSPACE_RELEASE", "STRELVA_REVENUE_SPLITS", "STRELVA_CONNECT", "STRELVA_SPLIT_PAYOUT_EXECUTION", "STRELVA_CONNECT_PROFILE_VERSION"]) {
      vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1"); vi.stubEnv("STRELVA_REVENUE_SPLITS", "1"); vi.stubEnv("STRELVA_CONNECT", "1"); vi.stubEnv("STRELVA_SPLIT_PAYOUT_EXECUTION", "1"); vi.stubEnv("STRELVA_CONNECT_PROFILE_VERSION", "approved-v1"); vi.stubEnv("STRELVA_CONNECT_FEES_COLLECTOR", "stripe"); vi.stubEnv("STRELVA_CONNECT_LOSSES_COLLECTOR", "stripe");
      const p = ports(); await expect(executeGovernedPayout(authority.actor, { payoutId: id, profileVersion: "approved-v1" }, { db: p.database, stripe: p.stripe, beforeProviderMutation: async () => { vi.stubEnv(withdrawn, "withdrawn"); } })).rejects.toThrow(); expect(p.create).not.toHaveBeenCalled(); expect(p.database.rpc.mock.calls.some(call => call[0] === "assert_governed_payout_dispatch")).toBe(false);
    }
  });
});
