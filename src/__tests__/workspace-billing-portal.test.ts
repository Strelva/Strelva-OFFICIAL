import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { openWorkspaceBillingPortal, readWorkspacePortalTarget, type WorkspacePortalTarget } from "@/platform/business-billing/workspace-portal";
import type { Db } from "@/platform/infra/db/client";
import type { Workspace } from "@/platform/workspaces";

const workspaceId = "7e000000-0000-4000-8000-000000000010";
const actor = { userId: "7e000000-0000-4000-8000-000000000011", verifiedEmail: "owner@example.test" };
const returnUrl = `https://app.example.test/workspace/billing?workspaceId=${workspaceId}`;
const owner: Workspace = { id: workspaceId, kind: "customer", name: "Example", createdBy: actor.userId, createdAt: "", updatedAt: "", access: "member", role: "owner" };
const binding: WorkspacePortalTarget = { workspaceId, customerId: "cus_Test", subscriptions: [{ id: "sub_Test", legacy: false, status: "active" }] };
const subscription = { id: "sub_Test", customer: "cus_Test", status: "active", metadata: { workspaceId, payerKind: "business" } };
function setup() {
  const create = vi.fn(async () => ({ url: "https://billing.stripe.com/p/session" }));
  const retrieve = vi.fn(async () => ({ id: "cus_Test", metadata: {} }));
  const list = vi.fn(async () => ({ data: [subscription], has_more: false }));
  const workspaces = vi.fn(async () => [owner]);
  const target = vi.fn(async () => binding);
  const stripe = { customers: { retrieve }, subscriptions: { list }, billingPortal: { sessions: { create } } } as unknown as Pick<Stripe, "customers" | "subscriptions" | "billingPortal">;
  return { dependencies: { workspaces, target, stripe }, create, retrieve, list, workspaces, target };
}

describe("owner workspace billing portal", () => {
  it("uses recorded direct subscription identity and returns to the exact workspace", async () => {
    const test = setup();
    await expect(openWorkspaceBillingPortal(actor, workspaceId, "manage", returnUrl, test.dependencies)).resolves.toBe("https://billing.stripe.com/p/session");
    expect(test.create).toHaveBeenCalledWith({ customer: "cus_Test", return_url: returnUrl });
    expect(test.workspaces).toHaveBeenCalledTimes(2);
    expect(test.target).toHaveBeenCalledTimes(2);
  });
  it("opens cancellation for exactly the verified subscription with hosted confirmation", async () => {
    const test = setup();
    await openWorkspaceBillingPortal(actor, workspaceId, "cancel", returnUrl, test.dependencies);
    expect(test.create).toHaveBeenCalledWith({ customer: "cus_Test", return_url: returnUrl, flow_data: { type: "subscription_cancel", subscription_cancel: { subscription: "sub_Test" }, after_completion: { type: "redirect", redirect: { return_url: returnUrl } } } });
  });
  it.each(["admin", "member"] as const)("does not grant %s a payer capability", async role => {
    const test = setup(); test.workspaces.mockResolvedValue([{ ...owner, role }]);
    await expect(openWorkspaceBillingPortal(actor, workspaceId, "manage", returnUrl, test.dependencies)).rejects.toThrow();
    expect(test.target).not.toHaveBeenCalled(); expect(test.create).not.toHaveBeenCalled();
  });
  it("does not grant an agency provider seat owner billing", async () => {
    const test = setup(); test.workspaces.mockResolvedValue([{ ...owner, access: "provider_seat" }]);
    await expect(openWorkspaceBillingPortal(actor, workspaceId, "manage", returnUrl, test.dependencies)).rejects.toThrow();
    expect(test.create).not.toHaveBeenCalled();
  });
  it.each([
    { ...subscription, customer: "cus_Foreign" },
    { ...subscription, metadata: { workspaceId: "foreign", payerKind: "business" } },
    { ...subscription, metadata: { workspaceId, payerKind: "agency" } },
    { ...subscription, metadata: {} },
    { ...subscription, id: "sub_Foreign" },
  ])("rejects a foreign or unqualified provider binding", async value => {
    const test = setup(); test.list.mockResolvedValue({ data: [value as typeof subscription], has_more: false });
    await expect(openWorkspaceBillingPortal(actor, workspaceId, "manage", returnUrl, test.dependencies)).rejects.toThrow();
    expect(test.create).not.toHaveBeenCalled();
  });
  it("keeps exact recorded converted subscriptions usable without newly added metadata", async () => {
    const test = setup(); test.target.mockResolvedValue({ ...binding, subscriptions: [{ ...binding.subscriptions[0]!, legacy: true }] });
    test.list.mockResolvedValue({ data: [{ ...subscription, metadata: {} } as typeof subscription], has_more: false });
    await openWorkspaceBillingPortal(actor, workspaceId, "cancel", returnUrl, test.dependencies);
    expect(test.create).toHaveBeenCalledOnce();
  });
  it("refuses customer-wide access if another subscription is exposed", async () => {
    const test = setup(); test.list.mockResolvedValue({ data: [subscription, { ...subscription, id: "sub_Other" }], has_more: false });
    await expect(openWorkspaceBillingPortal(actor, workspaceId, "manage", returnUrl, test.dependencies)).rejects.toThrow();
    expect(test.create).not.toHaveBeenCalled();
  });
  it("refuses an incomplete provider list or unreadable provider state", async () => {
    const test = setup(); test.list.mockResolvedValue({ data: [subscription], has_more: true });
    await expect(openWorkspaceBillingPortal(actor, workspaceId, "manage", returnUrl, test.dependencies)).rejects.toThrow();
    test.list.mockRejectedValue(new Error("Stripe unavailable"));
    await expect(openWorkspaceBillingPortal(actor, workspaceId, "manage", returnUrl, test.dependencies)).rejects.toThrow();
    expect(test.create).not.toHaveBeenCalled();
  });
  it("does not treat an already cancelled plan as a new cancellation", async () => {
    const test = setup(); test.list.mockResolvedValue({ data: [{ ...subscription, status: "canceled" }], has_more: false });
    await expect(openWorkspaceBillingPortal(actor, workspaceId, "cancel", returnUrl, test.dependencies)).rejects.toThrow("No active subscription");
    expect(test.create).not.toHaveBeenCalled();
  });
  it("refuses capability issuance after owner removal or a payer binding change", async () => {
    const test = setup(); test.workspaces.mockResolvedValueOnce([owner]).mockResolvedValueOnce([]);
    await expect(openWorkspaceBillingPortal(actor, workspaceId, "manage", returnUrl, test.dependencies)).rejects.toThrow();
    expect(test.create).not.toHaveBeenCalled();
    const changed = setup(); changed.target.mockResolvedValueOnce(binding).mockResolvedValueOnce({ ...binding, customerId: "cus_Changed" });
    await expect(openWorkspaceBillingPortal(actor, workspaceId, "manage", returnUrl, changed.dependencies)).rejects.toThrow("billing record changed");
    expect(changed.create).not.toHaveBeenCalled();
  });
  it("refuses malformed hosted URLs", async () => {
    const test = setup(); test.create.mockResolvedValue({ url: "https://foreign.example/p/session" });
    await expect(openWorkspaceBillingPortal(actor, workspaceId, "manage", returnUrl, test.dependencies)).rejects.toThrow();
  });
});

function database(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    accounts: null,
    work_allowance_subscription_entitlements: [{ stripe_customer_id: "cus_Test", stripe_subscription_id: "sub_Test", payer_kind: "business", payer_workspace_id: null, status: "active" }],
    workspace_payer_transitions: [],
    subscriptions: [],
    ...overrides,
  };
  const calls: { table: string; filters: Record<string, string> }[] = [];
  const from = (table: string) => {
    const filters: Record<string, string> = {};
    calls.push({ table, filters });
    const builder = {
      select: () => builder, eq: (key: string, value: string) => { filters[key] = value; return builder; }, order: () => builder, limit: () => builder, maybeSingle: () => builder,
      then: (resolve: (value: unknown) => unknown) => {
        const foreignRead = Boolean(filters.stripe_customer_id);
        const data = foreignRead ? table === "work_allowance_subscription_entitlements" ? [{ workspace_id: workspaceId }] : [] : values[table];
        return Promise.resolve(resolve({ data, error: overrides[`${table}Error`] ?? null }));
      },
    };
    return builder;
  };
  return { db: { from } as unknown as Db, calls };
}
describe("workspace portal recorded targets", () => {
  it("supports a direct business subscription without a tenant or billing account", async () => {
    const test = database();
    await expect(readWorkspacePortalTarget(workspaceId, test.db)).resolves.toEqual(binding);
    expect(test.calls.filter(call => !call.filters.stripe_customer_id).every(call => call.filters.workspace_id === workspaceId)).toBe(true);
  });
  it("refuses an agency payer transition even with stale business-paid entitlement rows", async () => {
    const test = database({ workspace_payer_transitions: [{ successor_kind: "agency" }] });
    await expect(readWorkspacePortalTarget(workspaceId, test.db)).rejects.toThrow();
  });
  it("fails closed when the billing read fails or no customer is recorded", async () => {
    await expect(readWorkspacePortalTarget(workspaceId, database({ accountsError: { message: "unavailable" } }).db)).rejects.toThrow();
    await expect(readWorkspacePortalTarget(workspaceId, database({ work_allowance_subscription_entitlements: [] }).db)).rejects.toThrow();
    await expect(readWorkspacePortalTarget(workspaceId, null)).rejects.toThrow();
  });
  it("refuses mismatched recorded customer and agency entitlement", async () => {
    const test = database({ accounts: { id: "account", stripe_customer_id: "cus_Other", payer_kind: "business", payer_workspace_id: null } });
    await expect(readWorkspacePortalTarget(workspaceId, test.db)).rejects.toThrow();
    const agency = database({ work_allowance_subscription_entitlements: [{ stripe_customer_id: "cus_Test", stripe_subscription_id: "sub_Test", payer_kind: "agency", payer_workspace_id: "agency", status: "active" }] });
    await expect(readWorkspacePortalTarget(workspaceId, agency.db)).rejects.toThrow();
  });
});
