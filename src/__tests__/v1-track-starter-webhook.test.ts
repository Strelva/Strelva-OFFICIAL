import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as trackPOST } from "@/app/api/v1/track/[tenant]/route";
import { POST as stripeWebhookPOST } from "../../custom-repo-starter/commerce/stripe-webhook-route";

const mocks = vi.hoisted(() => ({
  stripeEvent: null as unknown,
  getTenantConfig: vi.fn(),
  getTrackPublicKey: vi.fn(),
  getTrackPublicKeys: vi.fn(),
  recordOrder: vi.fn(),
  trackClick: vi.fn(),
  rateLimited: vi.fn(),
  getRedis: vi.fn(),
}));

vi.mock("stripe", () => ({
  default: class StripeMock {
    webhooks = {
      constructEvent: () => mocks.stripeEvent,
    };
    checkout = {
      sessions: {
        listLineItems: async () => ({ data: [] }),
      },
    };
    constructor(_key: string) {}
  },
}));

vi.mock("@/lib/tenants", () => ({
  getTenantConfig: () => mocks.getTenantConfig(),
}));

vi.mock("@/lib/tracking-signing-keys", () => ({
  getTenantTrackPublicKey: () => mocks.getTrackPublicKey(),
  getTenantTrackPublicKeys: () => mocks.getTrackPublicKeys(),
}));

vi.mock("@/lib/orders", () => ({
  recordOrder: (...args: unknown[]) => mocks.recordOrder(...args),
}));

vi.mock("@/lib/storage", () => ({
  trackClick: (...args: unknown[]) => mocks.trackClick(...args),
}));

vi.mock("@/platform/infra/rate-limit", () => ({
  isRateLimitedAsync: (...args: unknown[]) => mocks.rateLimited(...args),
  rateLimitKey: (_request: Request, scope: string) => `${scope}:test`,
}));

vi.mock("@/platform/infra/redis", () => ({
  getRedis: () => mocks.getRedis(),
}));

describe("starter Stripe webhook tracking contract", () => {
  let trackingPrivateKey: string;
  let trackingPublicKey: string;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    const pair = generateKeyPairSync("ed25519");
    trackingPublicKey = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
    trackingPrivateKey = pair.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");

    mocks.stripeEvent = {
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_123", amount_total: 2_499, currency: "usd" } },
    };
    mocks.getTenantConfig.mockResolvedValue({
      id: "gldf",
      subdomain: "gldf",
      active: true,
      productionDomain: "shop.example.test",
      customDomains: ["www.shop.example.test"],
      siteUrl: "https://shop.example.test",
    });
    mocks.getTrackPublicKeys.mockResolvedValue({
      currentPublicKey: trackingPublicKey,
      previousPublicKey: null,
      previousValidUntil: null,
    });
    mocks.getTrackPublicKey.mockResolvedValue(trackingPublicKey);
    mocks.recordOrder.mockResolvedValue({ id: "recorded-order" });
    mocks.rateLimited.mockResolvedValue(false);
    mocks.getRedis.mockReturnValue(null);
    fetchSpy = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
    vi.stubEnv("TENANT_ID", "gldf");
    vi.stubEnv("SCAFFOLD_API_URL", "https://app.example.test");
    vi.stubEnv("REB_TRACKING_PRIVATE_KEY", trackingPrivateKey);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("records a starter webhook order without relying on an injected Origin header", async () => {
    const webhookResponse = await stripeWebhookPOST(new Request("https://shop.example.test/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "stripe-signature" },
      body: "stripe-event-body",
    }));
    expect(webhookResponse.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [trackUrl, trackInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const trackRequest = new Request(trackUrl, trackInit);
    expect(trackRequest.headers.get("origin")).toBeNull();
    expect(trackRequest.headers.get("x-reb-track-origin")).toBe("https://shop.example.test");

    const trackResponse = await trackPOST(trackRequest, {
      params: Promise.resolve({ tenant: "gldf" }),
    });

    expect(trackResponse.status).toBe(200);
    await expect(trackResponse.json()).resolves.toEqual({ ok: true, verified: true, recorded: true });
    expect(mocks.recordOrder).toHaveBeenCalledWith("gldf", expect.objectContaining({
      externalId: "cs_test_123",
      verification: "site-signature",
    }));
  });
});
