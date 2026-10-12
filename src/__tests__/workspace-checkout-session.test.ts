import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { openWorkspaceSubscriptionCheckout, workspaceCheckoutStore, type WorkspaceCheckoutStore, type WorkspaceCheckoutTarget } from "@/platform/business-billing/workspace-checkout-session";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";

const WS = "11111111-1111-4111-8111-111111111111";
const OWNER = "22222222-2222-4222-8222-222222222222";
const ATTEMPT = "33333333-3333-4333-8333-333333333333";
const actor: WorkspaceActor = { userId: OWNER, verifiedEmail: "owner@example.test" };
const config = { enabled: true, priceId: "price_123", allowanceConfigKey: "workspace.v1" };
const back = `https://app.example.test/workspace/billing?workspaceId=${WS}`;
const time = Date.parse("2026-10-12T10:00:00Z");
let target: WorkspaceCheckoutTarget;
const workspaces = vi.fn();
const create = vi.fn();
const retrieve = vi.fn();
const subscription = vi.fn();
const subscriptions = vi.fn();
const customer = vi.fn();
const prepare = vi.fn();
const observe = vi.fn();
const store: WorkspaceCheckoutStore = { prepare, observe };
// Stripe's SDK types include request envelopes irrelevant to this fake transport.
const stripe = { checkout: { sessions: { create, retrieve } }, subscriptions: { retrieve: subscription, list: subscriptions }, customers: { retrieve: customer } } as unknown as Pick<Stripe, "checkout" | "subscriptions" | "customers">;
const open = (overrides: Partial<Parameters<typeof openWorkspaceSubscriptionCheckout>[4]> = {}, selected = config) => openWorkspaceSubscriptionCheckout(actor, WS, selected, back, { store, stripe, workspaces, now: () => time, ...overrides });
const session = (status = "open") => ({ id: "cs_test_one", mode: "subscription", status, client_reference_id: WS,
  url: "https://checkout.stripe.com/c/pay/one", customer: status === "complete" ? "cus_one" : null, subscription: status === "complete" ? "sub_one" : null,
  metadata: { workspaceId: WS, payerId: OWNER, payerKind: "business", allowanceConfigKey: "workspace.v1", planKey: "workspace", source: "self_serve", checkoutAttemptId: ATTEMPT } });

describe("durable workspace subscription checkout", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    target = { attempt: { id: ATTEMPT, workspaceId: WS, payerUserId: OWNER, createdAt: new Date(time).toISOString(), state: "pending", sessionId: null,
      checkout: { priceId: "price_123", payerEmail: actor.verifiedEmail, allowanceConfigKey: "workspace.v1", returnUrl: back, customerId: null } }, customerIds: [], subscriptionIds: [] };
    workspaces.mockResolvedValue([{ id: WS, kind: "customer", role: "owner", access: "member" }]);
    prepare.mockImplementation(async () => structuredClone(target));
    observe.mockImplementation(async (_id, value, close) => { target.attempt.sessionId = value.id; target.attempt.state = close ? "closed" : value.status; });
    create.mockResolvedValue(session()); retrieve.mockResolvedValue(session());
    subscription.mockResolvedValue({ id: "sub_one", customer: "cus_one", status: "canceled", metadata: { workspaceId: WS } });
    customer.mockResolvedValue({ id: "cus_one", metadata: { workspaceId: WS } });
    subscriptions.mockResolvedValue({ has_more: false, data: [] });
  });

  it("reuses a persisted session across the hourly boundary and changed price/allowance configuration", async () => {
    await expect(open()).resolves.toBe("https://checkout.stripe.com/c/pay/one");
    await expect(open({ now: () => time + 2 * 60 * 60 * 1000 }, { ...config, priceId: "price_new", allowanceConfigKey: "new.v2" })).resolves.toBe("https://checkout.stripe.com/c/pay/one");
    expect(create).toHaveBeenCalledTimes(1);
    expect(retrieve).toHaveBeenCalledWith("cs_test_one");
    expect(create.mock.calls[0]?.[1]).toEqual({ idempotencyKey: `workspace-checkout:${ATTEMPT}` });
  });

  it("concurrent calls use the same durable idempotency key and identical Stripe request", async () => {
    await Promise.all([open(), open()]);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0]).toEqual(create.mock.calls[1]);
    expect(create.mock.calls[0]?.[1]?.idempotencyKey).toBe(`workspace-checkout:${ATTEMPT}`);
  });

  it("retries provider timeout with the original request, including the price and owner", async () => {
    create.mockRejectedValueOnce(new Error("connection lost"));
    await expect(open()).rejects.toBeInstanceOf(WorkspaceStoreError);
    await expect(open({}, { ...config, priceId: "price_changed" })).resolves.toContain("checkout.stripe.com");
    expect(create.mock.calls[0]).toEqual(create.mock.calls[1]);
  });

  it("recovers acceptance followed by a failed save using the same key", async () => {
    observe.mockRejectedValueOnce(new WorkspaceStoreError("save lost"));
    await expect(open()).rejects.toBeInstanceOf(WorkspaceStoreError);
    await expect(open()).resolves.toContain("checkout.stripe.com");
    expect(create.mock.calls[0]).toEqual(create.mock.calls[1]);
  });

  it("freezes an unbound uncertain attempt before Stripe can prune its key", async () => {
    await expect(open({ now: () => time + 23 * 60 * 60 * 1000 })).rejects.toBeInstanceOf(WorkspaceStoreError);
    expect(create).not.toHaveBeenCalled(); expect(observe).not.toHaveBeenCalled();
  });

  it("completed checkout blocks a second subscription while its webhook is delayed", async () => {
    target.attempt.sessionId = "cs_test_one"; target.attempt.state = "open";
    retrieve.mockResolvedValue(session("complete"));
    await expect(open()).rejects.toBeInstanceOf(WorkspaceConflictError);
    expect(observe).toHaveBeenCalledWith(ATTEMPT, expect.objectContaining({ status: "complete", subscription: "sub_one" }), false);
    expect(create).not.toHaveBeenCalled();
  });

  it("only a provider-confirmed expired session closes a pending attempt", async () => {
    target.attempt.sessionId = "cs_test_one"; target.attempt.state = "open";
    retrieve.mockRejectedValueOnce(new Error("timeout"));
    await expect(open()).rejects.toBeInstanceOf(WorkspaceStoreError);
    expect(observe).not.toHaveBeenCalled();
    retrieve.mockResolvedValueOnce(session("expired"));
    await expect(open()).rejects.toBeInstanceOf(WorkspaceConflictError);
    expect(observe).toHaveBeenCalledWith(ATTEMPT, expect.objectContaining({ status: "expired" }), true);
    expect(create).not.toHaveBeenCalled();
  });

  it.each(["active", "trialing", "past_due", "unpaid", "incomplete", "paused"])("blocks current %s subscriptions despite recorded cancellation", async status => {
    target.subscriptionIds = ["sub_one"]; target.customerIds = ["cus_one"];
    subscription.mockResolvedValue({ id: "sub_one", customer: "cus_one", status, metadata: { workspaceId: WS } });
    await expect(open()).rejects.toBeInstanceOf(WorkspaceConflictError);
    expect(create).not.toHaveBeenCalled();
  });

  it("finds an unprojected active subscription on the recorded customer", async () => {
    target.customerIds = ["cus_one"];
    subscriptions.mockResolvedValue({ has_more: false, data: [{ id: "sub_delayed", status: "active" }] });
    await expect(open()).rejects.toBeInstanceOf(WorkspaceConflictError);
    expect(create).not.toHaveBeenCalled();
  });

  it("reuses the saved customer after a provider-confirmed cancellation", async () => {
    target.customerIds = ["cus_one"]; target.subscriptionIds = ["sub_one"]; target.attempt.checkout.customerId = "cus_one";
    create.mockResolvedValue({ ...session(), customer: "cus_one" });
    await expect(open()).resolves.toContain("checkout.stripe.com");
    expect(create.mock.calls[0]?.[0]).toMatchObject({ customer: "cus_one" });
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty("customer_email");
  });

  it("withholds a checkout that Stripe binds to a different saved customer", async () => {
    target.customerIds = ["cus_one"]; target.attempt.checkout.customerId = "cus_one";
    create.mockResolvedValue({ ...session(), customer: "cus_wrong" });
    await expect(open()).rejects.toBeInstanceOf(WorkspaceStoreError);
    expect(observe).not.toHaveBeenCalled();
  });

  it("refuses provider pagination, customer mismatch, and retrieval uncertainty", async () => {
    target.customerIds = ["cus_one"];
    subscriptions.mockResolvedValueOnce({ has_more: true, data: [] });
    await expect(open()).rejects.toBeInstanceOf(WorkspaceConflictError);
    customer.mockResolvedValueOnce({ id: "cus_wrong", metadata: {} });
    await expect(open()).rejects.toBeInstanceOf(WorkspaceStoreError);
    customer.mockRejectedValueOnce(new Error("provider unavailable"));
    await expect(open()).rejects.toBeInstanceOf(WorkspaceStoreError);
    expect(create).not.toHaveBeenCalled();
  });

  it("an owner revocation or agency payer transition during provider reads stops creation", async () => {
    prepare.mockResolvedValueOnce(target).mockRejectedValueOnce(new WorkspaceAccessError());
    await expect(open()).rejects.toBeInstanceOf(WorkspaceAccessError);
    expect(create).not.toHaveBeenCalled();
  });

  it("saves provider acceptance but withholds the URL if authority changes afterwards", async () => {
    prepare.mockResolvedValueOnce(target).mockResolvedValueOnce(target).mockRejectedValueOnce(new WorkspaceAccessError());
    await expect(open()).rejects.toBeInstanceOf(WorkspaceAccessError);
    expect(observe).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
  });

  it.each(["admin", "member", "provider_seat", "delegated_read"])("never creates checkout under %s authority", async authority => {
    workspaces.mockResolvedValue([{ id: WS, kind: "customer", role: authority === "admin" ? "admin" : "owner", access: authority === "member" ? "member" : authority }]);
    if (authority === "member") workspaces.mockResolvedValue([{ id: WS, kind: "customer", role: "member", access: "member" }]);
    await expect(open()).rejects.toBeInstanceOf(WorkspaceAccessError);
    expect(create).not.toHaveBeenCalled(); expect(prepare).not.toHaveBeenCalled();
  });

  it("never returns a foreign session or unsafe redirect", async () => {
    create.mockResolvedValueOnce({ ...session(), metadata: { ...session().metadata, workspaceId: "foreign" } });
    await expect(open()).rejects.toBeInstanceOf(WorkspaceStoreError);
    expect(observe).not.toHaveBeenCalled();
    create.mockResolvedValueOnce({ ...session(), url: "https://foreign.example.test" });
    await expect(open()).rejects.toBeInstanceOf(WorkspaceStoreError);
    expect(observe).toHaveBeenCalledOnce();
  });
});

describe("checkout RPC boundary", () => {
  it("fails closed when durable storage is unavailable or returns invalid scope", async () => {
    await expect(workspaceCheckoutStore(null).prepare(actor, WS, target.attempt.checkout)).rejects.toBeInstanceOf(WorkspaceStoreError);
    const rpc = vi.fn().mockResolvedValue({ data: { ...target, attempt: { ...target.attempt, workspaceId: OWNER } }, error: null });
    await expect(workspaceCheckoutStore({ rpc }).prepare(actor, WS, target.attempt.checkout)).rejects.toBeInstanceOf(WorkspaceStoreError);
  });

  it.each([["workspace_checkout_denied", WorkspaceAccessError], ["workspace_checkout_conflict_subscription", WorkspaceConflictError], ["storage failure", WorkspaceStoreError]])("maps %s without provider writes", async (message, errorType) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message } });
    await expect(workspaceCheckoutStore({ rpc }).prepare(actor, WS, target.attempt.checkout)).rejects.toBeInstanceOf(errorType);
  });

  it("requires an acknowledgement for the exact accepted provider attempt", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { recorded: true, attemptId: "wrong" }, error: null });
    await expect(workspaceCheckoutStore({ rpc }).observe(ATTEMPT, session() as unknown as Stripe.Checkout.Session, false)).rejects.toBeInstanceOf(WorkspaceStoreError);
  });
});
