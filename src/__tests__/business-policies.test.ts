import { afterEach, describe, expect, it, vi } from "vitest";
import { businessPolicyPatchSchema, policyValueSchemas, type BusinessRecord } from "@/platform/business-record/contracts";
import { selectBusinessPolicies, selectPublishedBusinessPolicies } from "@/platform/business-record/policies";
import { patchBusinessPolicies, readBusinessPolicies } from "@/platform/business-record/service";
import { setBusinessRecordDb } from "@/platform/business-record/repository";

const workspace = "22222222-2222-4222-8222-222222222222";
const actor = { userId: "11111111-1111-4111-8111-111111111111", verifiedEmail: "owner@example.test" };
const entry = (value: unknown, verified = true, source: "owner" | "agent" = "owner") => ({
  value, verified, source, updatedBy: actor.userId, updatedAt: "2026-10-07T12:00:00Z",
});
const record: BusinessRecord = {
  workspaceId: workspace, revision: 3, lastSequence: 3, updatedAt: null, access: "owner", contactCount: 0, services: [], people: [],
  facts: { cancellation: entry({ summary: "Cancel 24 hours ahead", noticeHours: 24 }),
    deposit: entry({ required: false }, false, "agent"), service_area: entry(["Buffalo"]),
    owner_recipient: entry({ email: "private@example.test" }) },
};
afterEach(() => setBusinessRecordDb(null));

describe("typed business policy facts", () => {
  it("separates confirmed terms from uncertain proposals and unknown terms", () => {
    const result = selectBusinessPolicies(record);
    expect(result.confirmed.cancellation?.value.noticeHours).toBe(24);
    expect(result.confirmed.service_area?.value).toEqual(["Buffalo"]);
    expect(result.unconfirmed.deposit?.value.required).toBe(false);
    expect(result.confirmed).not.toHaveProperty("deposit");
    expect(result.confirmed).not.toHaveProperty("payment_methods");
    expect(result.confirmed).not.toHaveProperty("owner_recipient");
    expect(result.confirmed.cancellation).toMatchObject({ source: "owner", updatedBy: actor.userId });
    expect(selectBusinessPolicies({ ...record, facts: {} })).toMatchObject({ confirmed: {}, unconfirmed: {} });
  });
  it("only publishes confirmed terms without private actor or routing identifiers", () => {
    const published = selectPublishedBusinessPolicies(record);
    expect(published).toEqual({ cancellation: { value: { summary: "Cancel 24 hours ahead", noticeHours: 24 }, source: "owner", updatedAt: "2026-10-07T12:00:00Z" },
      service_area: { value: ["Buffalo"], source: "owner", updatedAt: "2026-10-07T12:00:00Z" } });
    const forged = { ...record, facts: { cancellation: entry({ summary: "Untrusted" }, true, "agent") } };
    expect(selectPublishedBusinessPolicies(forged)).toEqual({});
    expect(selectBusinessPolicies(forged).unconfirmed).toHaveProperty("cancellation");
  });
  it("rejects malformed stored terms instead of making a public claim", () => {
    expect(() => selectBusinessPolicies({ ...record, facts: { deposit: entry({ required: "yes" }) } })).toThrow();
  });
  it.each([
    ["cancellation", { summary: "", noticeHours: 24 }], ["cancellation", { summary: "Policy", noticeHours: -1 }],
    ["deposit", { required: true, amountCents: 500 }], ["deposit", { required: true, currency: "USD" }],
    ["deposit", { required: false, percent: 20 }], ["deposit", { required: true, percent: 101 }],
    ["deposit", { required: true, amountCents: 500, currency: "USD", percent: 20 }],
    ["deposit", { required: true, amountCents: 0, currency: "usd" }], ["payment_methods", ["cash", "cash"]],
    ["payment_methods", ["bitcoin"]], ["age_waiver", { minimumAge: 21 }], ["age_waiver", { waiverRequired: true, minimumAge: 121 }],
    ["booking_rules", { summary: "Book ahead", maximumAdvanceDays: 0.5 }], ["response_time", { maximumHours: 0 }],
    ["response_time", { maximumHours: 24, extra: true }], ["service_area", []],
  ] as const)("rejects invalid %s terms", (key, value) => {
    expect(policyValueSchemas[key].safeParse(value).success).toBe(false);
  });
  it("accepts all policy kinds, explicit false, zero notice, and removals", () => {
    expect(businessPolicyPatchSchema.parse({ cancellation: { value: { summary: "No notice required", noticeHours: 0 } },
      deposit: { value: { required: true, amountCents: 2500, currency: "USD" } },
      payment_methods: { value: ["cash", "credit_card"] }, age_waiver: { value: { waiverRequired: false, minimumAge: 0 } },
      service_area: { value: ["Buffalo"] }, booking_rules: { value: { summary: "Reservations required", reservationRequired: true } },
      response_time: { value: { maximumHours: 48 } } })).toHaveProperty("deposit");
    expect(businessPolicyPatchSchema.parse({ cancellation: null })).toEqual({ cancellation: null });
    expect(businessPolicyPatchSchema.safeParse({ phone: null }).success).toBe(false);
  });
  it("reads through the existing actor-checked record RPC", async () => {
    const rpc = vi.fn(async () => ({ data: record, error: null })); setBusinessRecordDb({ rpc });
    await expect(readBusinessPolicies(actor, workspace)).resolves.toMatchObject({ workspaceId: workspace, revision: 3, confirmed: { cancellation: {} } });
    expect(rpc).toHaveBeenCalledWith("read_business_record", { p_workspace_id: workspace, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail });
  });
  it("writes with existing revision and digest machinery and refuses agent confirmation", async () => {
    const rpc = vi.fn(async () => ({ data: { workspaceId: workspace, sequence: 4, revision: 4, changeCount: 1, undoOf: null,
      contacts: { created: 0, merged: 0, unchanged: 0 }, replayed: false }, error: null })); setBusinessRecordDb({ rpc });
    await patchBusinessPolicies(actor, workspace, 3, { deposit: { value: { required: false }, verified: true } }, { source: "owner" });
    expect(rpc).toHaveBeenCalledWith("patch_business_record", expect.objectContaining({ p_expected_revision: 3, p_source: "owner",
      p_patch: { facts: { deposit: { value: { required: false }, verified: true } } } }));
    await expect(patchBusinessPolicies(actor, workspace, 4, { deposit: { value: { required: false }, verified: true } }, { source: "agent" })).rejects.toThrow("Only an owner");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
