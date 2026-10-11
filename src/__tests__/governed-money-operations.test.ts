import { describe, expect, it, vi } from "vitest";
import { prepareGovernedCollection, readGovernedMoney, recordOperatorMoneyConfiguration, registerGovernedCreatorListing } from "@/platform/connect/governed-operations";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError } from "@/platform/workspaces/types";
const workspaceId = "11111111-1111-4111-8111-111111111111", userId = "22222222-2222-4222-8222-222222222222", other = "33333333-3333-4333-8333-333333333333";
const actor = { userId, verifiedEmail: "owner@example.test" };
const input = { workspaceId, lineId: other, priceVersion: "recorded-owner-price", amountCents: 1700, currency: "cad", installationId: null, periodStart: "2099-01-01T05:00:00.123456-05:00", periodEnd: "2099-02-01T10:00:00Z" };
const receipt = { lineId: input.lineId, workspaceId, priceVersion: input.priceVersion, amountCents: input.amountCents, currency: input.currency, installationId: null, acceptedBy: userId, acceptedAt: "2026-10-09T12:00:00.123456+00:00", periodStart: "2099-01-01T10:00:00.123456+00:00", periodEnd: "2099-02-01T10:00:00+00:00" };
const db = (data: unknown, error: null | { message: string } = null) => ({ rpc: vi.fn().mockResolvedValue({ data, error }) });
describe("ordinary governed money producers", () => {
  it("prepares the exact shown quote and period with actual session identity and no provider dispatch", async () => {
    const database = db(receipt);
    await expect(prepareGovernedCollection(actor, input, database)).resolves.toEqual({ receipt, collectionDispatch: "not_configured" });
    expect(database.rpc).toHaveBeenCalledExactlyOnceWith("prepare_governed_collection_terms", { p_user_id: userId, p_verified_email: actor.verifiedEmail, p_command: input });
  });
  it("rejects forged payer/customer/actor/price approval and missing timezone before DB", async () => {
    for (const changed of [{ customerId: "cus_Forged" }, { userId: other }, { acceptedBy: other }, { approvedBy: other }, { periodStart: "2099-01-01T10:00:00" }, { periodStart: "2099-01-01T10:00:00.1234567Z" }, { periodEnd: input.periodStart }]) {
      const database = db(receipt); await expect(prepareGovernedCollection(actor, { ...input, ...changed }, database)).rejects.toThrow(); expect(database.rpc).not.toHaveBeenCalled();
    }
  });
  it("rejects authority/payer/amount/currency/period substitution including one PostgreSQL microsecond", async () => {
    for (const changed of [{ workspaceId: other }, { acceptedBy: other }, { amountCents: 1701 }, { currency: "usd" }, { periodStart: "2099-01-01T10:00:00.123457Z" }, { priceVersion: "another-price" }, { installationId: other }]) await expect(prepareGovernedCollection(actor, input, db({ ...receipt, ...changed }))).rejects.toBeInstanceOf(WorkspaceStoreError);
  });
  it("returns honest unconfigured payer/price state and retains non-UUID historical line identifiers", async () => {
    const graph = { workspaceId, canPrepare: false, payer: null, prices: [], installations: [], terms: [{ ...receipt, lineId: "historical-native-invoice-line" }], collectionDispatch: "not_configured" };
    await expect(readGovernedMoney(actor, workspaceId, db(graph))).resolves.toEqual(graph);
    await expect(readGovernedMoney(actor, workspaceId, db({ ...graph, terms: [{ ...receipt, workspaceId: other }] }))).rejects.toBeInstanceOf(WorkspaceStoreError);
  });
  it("records only human-supplied configuration fields; replay JSONB ordering is harmless", async () => {
    const command = { action: "record_agreement", workspaceId, kind: "creator", version: "explicit-written-version", rateReference: "explicit-written-reference", rateBps: 171, effectiveFrom: "2099-01-01T00:00:00Z", effectiveUntil: null };
    const database = db({ action: command.action, recordedBy: userId, replayed: true, command: Object.fromEntries(Object.entries(command).reverse()) });
    await expect(recordOperatorMoneyConfiguration(actor, command, database)).resolves.toMatchObject({ replayed: true });
    expect(database.rpc).toHaveBeenCalledExactlyOnceWith("record_governed_money_configuration", { p_user_id: userId, p_verified_email: actor.verifiedEmail, p_command: command });
    await expect(recordOperatorMoneyConfiguration(actor, command, db({ action: command.action, recordedBy: userId, replayed: true, command: { ...command, rateBps: 172 } }))).rejects.toBeInstanceOf(WorkspaceStoreError);
    for (const changed of [{ approvedBy: other }, { rateBps: 10001 }, { rateReference: "" }]) { const unused = db(null); await expect(recordOperatorMoneyConfiguration(actor, { ...command, ...changed }, unused)).rejects.toThrow(); expect(unused.rpc).not.toHaveBeenCalled(); }
  });
  it("fails closed on malformed or foreign-operator configuration receipts", async () => {
    const command = { action: "authorize_payout", payoutId: other, profileVersion: "explicit-approved-profile" };
    for (const value of [null, {}, { action: command.action, recordedBy: other, replayed: false, command }, { action: command.action, recordedBy: userId, replayed: false, command: null }]) await expect(recordOperatorMoneyConfiguration(actor, command, db(value))).rejects.toBeInstanceOf(WorkspaceStoreError);
  });
  it("creator source picks definition identity in SQL; HTTP cannot supply an arbitrary definition or rate", async () => {
    const command = { workspaceId, sourceRevisionId: other, agreementVersion: "written-version", rateReference: "written-reference" };
    const listing = { id: other, creatorWorkspaceId: workspaceId, sourceRevisionId: other, definitionId: "source-owned-definition", agreementVersion: command.agreementVersion, rateReference: command.rateReference };
    await expect(registerGovernedCreatorListing(actor, command, db(listing))).resolves.toEqual(listing);
    for (const changed of [{ definitionId: "forged-source" }, { rateBps: 2000 }, { userId: other }]) { const unused = db(null); await expect(registerGovernedCreatorListing(actor, { ...command, ...changed }, unused)).rejects.toThrow(); expect(unused.rpc).not.toHaveBeenCalled(); }
    await expect(registerGovernedCreatorListing(actor, command, db({ ...listing, creatorWorkspaceId: other }))).rejects.toBeInstanceOf(WorkspaceStoreError);
  });
  it("preserves denied/conflict/unavailable outcomes and never fabricates configured terms", async () => {
    await expect(prepareGovernedCollection(actor, input, db(null, { message: "governed_money_denied" }))).rejects.toBeInstanceOf(WorkspaceAccessError);
    await expect(prepareGovernedCollection(actor, input, db(null, { message: "governed_money_not_configured" }))).rejects.toBeInstanceOf(WorkspaceConflictError);
    await expect(prepareGovernedCollection(actor, input, null)).rejects.toBeInstanceOf(WorkspaceStoreError);
  });
  it("compares recorded date windows at PostgreSQL microsecond precision", async () => {
    const exact = { ...input, periodStart: "2099-01-01T10:00:00.123456Z", periodEnd: "2099-01-01T10:00:00.123457Z" };
    await expect(prepareGovernedCollection(actor, exact, db({ ...receipt, periodStart: exact.periodStart, periodEnd: exact.periodEnd }))).resolves.toMatchObject({ collectionDispatch: "not_configured" });
    const command = { action: "record_price", version: "written-version", amountCents: 1700, currency: "cad", definitionId: null, effectiveFrom: "2099-01-01T10:00:00.123456Z", effectiveUntil: "2099-01-01T10:00:00.123455Z" };
    const unused = db(null); await expect(recordOperatorMoneyConfiguration(actor, command, unused)).rejects.toThrow(); expect(unused.rpc).not.toHaveBeenCalled();
  });
});
