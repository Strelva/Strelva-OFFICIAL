import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => null }));
import { readBusinessBilling } from "@/platform/business-billing";
import { WorkspaceAccessError, WorkspaceStoreError } from "@/platform/workspaces/types";
import { BILLING_AGENCY_ID, BILLING_WORKSPACE_ID, billingFixture } from "./fixtures/business-billing";

const actor = { userId: "44444444-4444-4444-8444-444444444444", verifiedEmail: "owner@example.test" };
const rpc = vi.fn();
const db = { rpc };

beforeEach(() => { vi.stubEnv("STRELVA_BUSINESS_BILLING", "1"); rpc.mockReset(); });
afterEach(() => vi.unstubAllEnvs());

describe("business billing payer projection", () => {
  it.each(["business", "agency"] as const)("preserves a %s party independently of its recipient", async (kind) => {
    const record = billingFixture({ payerParty: { kind, workspaceId: kind === "agency" ? BILLING_AGENCY_ID : BILLING_WORKSPACE_ID, name: "Recorded party" } });
    rpc.mockResolvedValue({ data: record, error: null });
    expect(await readBusinessBilling(actor, BILLING_WORKSPACE_ID, db)).toEqual(record);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("read_business_billing", {
      p_workspace_id: BILLING_WORKSPACE_ID, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail,
    });
  });

  it.each([undefined, null])("keeps an absent legacy party unknown (%s)", async (payerParty) => {
    rpc.mockResolvedValue({ data: billingFixture({ payerParty }), error: null });
    const result = await readBusinessBilling(actor, BILLING_WORKSPACE_ID, db);
    expect(result?.payerParty).toBe(payerParty);
    expect(result?.payer?.name).toBe("Billing contact");
  });

  it.each([
    { kind: "person", workspaceId: BILLING_WORKSPACE_ID, name: "Person" },
    { kind: "agency", workspaceId: "invalid", name: "Agency" },
    { kind: "agency", name: "Missing identity" },
    { kind: "agency", workspaceId: BILLING_AGENCY_ID, name: 42 },
  ])("refuses malformed party metadata rather than guessing the payer: %j", async (payerParty) => {
    rpc.mockResolvedValue({ data: { ...billingFixture(), payerParty }, error: null });
    await expect(readBusinessBilling(actor, BILLING_WORKSPACE_ID, db)).rejects.toThrow("invalid record");
  });

  it("preserves null names without substituting the billing recipient", async () => {
    rpc.mockResolvedValue({ data: billingFixture({ payerParty: { kind: "agency", workspaceId: BILLING_AGENCY_ID, name: null } }), error: null });
    expect((await readBusinessBilling(actor, BILLING_WORKSPACE_ID, db))?.payerParty?.name).toBeNull();
  });

  it("does not read while disabled or accept invalid workspace identities", async () => {
    vi.stubEnv("STRELVA_BUSINESS_BILLING", "0");
    expect(await readBusinessBilling(actor, BILLING_WORKSPACE_ID, db)).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
    vi.stubEnv("STRELVA_BUSINESS_BILLING", "1");
    await expect(readBusinessBilling(actor, "invalid", db)).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("keeps missing records, denied access and unavailable storage distinct", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await readBusinessBilling(actor, BILLING_WORKSPACE_ID, db)).toBeNull();
    rpc.mockResolvedValue({ data: null, error: { message: "business_billing_denied" } });
    await expect(readBusinessBilling(actor, BILLING_WORKSPACE_ID, db)).rejects.toBeInstanceOf(WorkspaceAccessError);
    rpc.mockResolvedValue({ data: null, error: { message: "database unavailable" } });
    await expect(readBusinessBilling(actor, BILLING_WORKSPACE_ID, db)).rejects.toBeInstanceOf(WorkspaceStoreError);
    await expect(readBusinessBilling(actor, BILLING_WORKSPACE_ID, null)).rejects.toBeInstanceOf(WorkspaceStoreError);
  });
});
