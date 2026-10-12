import { beforeEach, describe, expect, it, vi } from "vitest";
import { selfServeBillingConfig, workspaceCheckoutMetadata } from "@/platform/business-billing/workspace-checkout";
import { subscriptionAllowanceFromStripeEvent } from "@/platform/work-economics/subscription-entitlements";

const WS = "11111111-1111-4111-8111-111111111111";
const OWNER = "22222222-2222-4222-8222-222222222222";
const mocks = vi.hoisted(() => ({ create: vi.fn(), workspaces: vi.fn(), actor: vi.fn() }));
vi.mock("@/lib/billing", () => ({ getStripe: () => ({ checkout: { sessions: { create: mocks.create } } }) }));
vi.mock("@/platform/workspaces", () => ({ listWorkspaces: mocks.workspaces }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => true }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedWindowedAsync: vi.fn(async () => false) }));
vi.mock("@/platform/workspaces/http", async () => {
  const actual = await vi.importActual<typeof import("@/platform/workspaces/http")>("@/platform/workspaces/http");
  return { ...actual, workspaceHttpActor: mocks.actor, workspaceWriteGuard: () => null };
});
const post = (body: unknown) => new Request("https://app.example.test/api/workspace/billing-checkout", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://app.example.test" }, body: JSON.stringify(body) });

describe("self-serve workspace plan (ADR 0015)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    mocks.create.mockReset().mockResolvedValue({ url: "https://checkout.stripe.test/s/1" });
    mocks.actor.mockResolvedValue({ userId: OWNER, verifiedEmail: "owner@bakery.example.test" });
    mocks.workspaces.mockResolvedValue([{ id: WS, kind: "customer", access: "member", role: "owner", name: "Bakery" }]);
  });

  it("stays off until the flag, Stripe key and a real price id are all set; no price lives in code", () => {
    expect(selfServeBillingConfig({}).enabled).toBe(false);
    expect(selfServeBillingConfig({ STRELVA_SELF_SERVE_BILLING: "1", STRIPE_SECRET_KEY: "sk_test_x" }).enabled).toBe(false);
    expect(selfServeBillingConfig({ STRELVA_SELF_SERVE_BILLING: "1", STRIPE_SECRET_KEY: "sk_test_x", STRELVA_WORKSPACE_PRICE_ID: "29" }).enabled).toBe(false);
    expect(selfServeBillingConfig({ STRELVA_SELF_SERVE_BILLING: "1", STRIPE_SECRET_KEY: "sk_test_x", STRELVA_WORKSPACE_PRICE_ID: "price_123" })).toEqual({ enabled: true, priceId: "price_123", allowanceConfigKey: "unavailable" });
  });

  it("carries the business and its paying owner so the existing webhook records the subscription", () => {
    const metadata = workspaceCheckoutMetadata({ workspaceId: WS, payerUserId: OWNER, allowanceConfigKey: "workspace.v1" });
    const event = { id: "evt_1", created: 1_760_000_000, type: "checkout.session.completed", data: { object: {
      object: "checkout.session", id: "cs_1", subscription: "sub_1", customer: "cus_1", metadata,
      current_period_start: 1_760_000_000, current_period_end: 1_762_600_000 } } };
    const entitlement = subscriptionAllowanceFromStripeEvent(event);
    expect(entitlement).not.toBeNull();
    expect(entitlement).toMatchObject({ workspaceId: WS, payerId: OWNER, payerKind: "business", subscriptionId: "sub_1" });
    expect(metadata).toMatchObject({ workspaceId: WS, payerId: OWNER, payerKind: "business", planKey: "workspace" });
  });

  it("opens checkout only for the business's owner, and answers 503 while closed", async () => {
    const { POST } = await import("@/app/api/workspace/billing-checkout/route");
    expect((await POST(post({ workspaceId: WS }))).status).toBe(503);
    vi.stubEnv("STRELVA_SELF_SERVE_BILLING", "1"); vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x"); vi.stubEnv("STRELVA_WORKSPACE_PRICE_ID", "price_123");
    const ok = await POST(post({ workspaceId: WS }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ checkoutUrl: "https://checkout.stripe.test/s/1" });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ mode: "subscription", line_items: [{ price: "price_123", quantity: 1 }], client_reference_id: WS,
      metadata: expect.objectContaining({ workspaceId: WS, payerId: OWNER, payerKind: "business" }) }), expect.any(Object));
    mocks.workspaces.mockResolvedValue([{ id: WS, kind: "customer", access: "member", role: "admin", name: "Bakery" }]);
    expect((await POST(post({ workspaceId: WS }))).status).toBe(403);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
});
