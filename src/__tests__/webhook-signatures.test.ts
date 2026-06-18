import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";

/**
 * P0: spoofed-webhook coverage.
 *
 * Each external webhook (Stripe billing, Calendly, Vegaro) verifies an HMAC
 * signature header before it mutates tenant data. Previously NONE of these
 * verification paths had a test, so a regression that weakened/removed the
 * check (e.g. always-true verify, wrong algorithm, missing-header bypass)
 * would have shipped silently and let an attacker forge bookings or flip a
 * tenant's subscription status.
 *
 * For every route this suite asserts the three security-critical branches:
 *   (a) missing signature      -> rejected (no processing)
 *   (b) invalid/forged signature -> rejected (no processing)
 *   (c) valid signature        -> processed/accepted
 *
 * Signatures are constructed with the route's REAL algorithm + a test secret
 * (read directly from the route source) so a "valid" case proves the real
 * verifier accepts genuine traffic, not just that a mock returns true.
 *
 * External side effects (Sanity/Redis writes, the events queue, the Stripe
 * SDK for the non-billing routes) are mocked so the tests are hermetic.
 */

const mockAddEvent = vi.fn();
const mockUpdateTenant = vi.fn();

// Mutable Redis handle: tests that need a tenant lookup to succeed install a
// fake; otherwise it stays null (no Redis configured).
let redisHandle: unknown = null;

vi.mock("@/lib/events", () => ({
  addEvent: (...args: unknown[]) => mockAddEvent(...args),
}));

vi.mock("@/lib/tenants", () => ({
  updateTenant: (...args: unknown[]) => mockUpdateTenant(...args),
}));

vi.mock("@/lib/redis", () => ({
  getRedis: () => redisHandle,
}));

vi.mock("@/lib/production-guard", () => ({
  isProductionEnv: vi.fn(() => false),
}));

vi.mock("@/lib/monitoring", () => ({
  alert: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  redisHandle = null;
  mockAddEvent.mockResolvedValue({ id: "evt_fake" });
  mockUpdateTenant.mockResolvedValue({ id: "acme" });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Stripe billing webhook — Stripe's own t=<ts>,v1=<HMAC-SHA256("ts.body")>
// scheme, verified by the real Stripe SDK's constructEvent (NOT mocked here,
// so this exercises the genuine signature verifier).
// ---------------------------------------------------------------------------
describe("billing webhook signature verification", () => {
  const SECRET = "whsec_test_secret";

  function stripeSignatureHeader(payload: string, secret = SECRET, timestamp?: number): string {
    const ts = timestamp ?? Math.floor(Date.now() / 1000);
    const sig = crypto
      .createHmac("sha256", secret)
      .update(`${ts}.${payload}`)
      .digest("hex");
    return `t=${ts},v1=${sig}`;
  }

  async function post(headers: Record<string, string>, body: string) {
    // Import after env is stubbed so getStripe() picks up the test key.
    const { POST } = await import("@/app/api/billing/webhook/route");
    const req = new Request("https://admin.strelva.com/api/billing/webhook", {
      method: "POST",
      headers,
      body,
    });
    return POST(req);
  }

  beforeEach(() => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET);
  });

  // An invoice.paid is a no-op (no tenantId metadata path we assert against),
  // but reaches the switch only if the signature verifies. We use a benign
  // event type and assert acceptance via status code + that we got past
  // verification (no "Invalid signature" body).
  const validEvent = JSON.stringify({
    id: "evt_sig_ok",
    type: "customer.subscription.updated", // hits default branch -> 200, no side effects
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: { object: { id: "sub_1" } },
  });

  it("(a) rejects a request with no stripe-signature header", async () => {
    const res = await post({ "content-type": "application/json" }, validEvent);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/signature/i);
    expect(mockUpdateTenant).not.toHaveBeenCalled();
  });

  it("(a2) rejects a request with empty stripe-signature header", async () => {
    const res = await post({ "stripe-signature": "", "content-type": "application/json" }, validEvent);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/signature/i);
    expect(mockUpdateTenant).not.toHaveBeenCalled();
  });

  it("(b) rejects a forged/invalid signature", async () => {
    const res = await post(
      { "stripe-signature": "t=9999999999,v1=deadbeef", "content-type": "application/json" },
      validEvent
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/signature/i);
    expect(mockUpdateTenant).not.toHaveBeenCalled();
  });

  it("(b2) rejects a signature computed with the wrong secret", async () => {
    const header = stripeSignatureHeader(validEvent, "whsec_attacker");
    const res = await post(
      { "stripe-signature": header, "content-type": "application/json" },
      validEvent
    );
    expect(res.status).toBe(400);
    expect(mockUpdateTenant).not.toHaveBeenCalled();
  });

  it("(c) accepts a correctly-signed event and processes it", async () => {
    const header = stripeSignatureHeader(validEvent);
    const res = await post(
      { "stripe-signature": header, "content-type": "application/json" },
      validEvent
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.received).toBe(true);
    // Got past verification: not the "Invalid signature" rejection.
    expect(json.error).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Calendly webhook — header "Calendly-Webhook-Signature: t=<ts>,v1=<sig>",
// sig = HMAC-SHA256("<ts>.<body>") hex. Hand-rolled verifier in the route.
// ---------------------------------------------------------------------------
describe("calendly webhook signature verification", () => {
  const SECRET = "calendly_test_secret";

  function calendlySignatureHeader(payload: string, secret = SECRET, timestamp = 1700000000): string {
    const sig = crypto
      .createHmac("sha256", secret)
      .update(`${timestamp}.${payload}`)
      .digest("hex");
    return `t=${timestamp},v1=${sig}`;
  }

  async function post(headers: Record<string, string>, body: string) {
    const { POST } = await import("@/app/api/webhooks/calendly/route");
    const req = new Request("https://admin.strelva.com/api/webhooks/calendly", {
      method: "POST",
      headers,
      body,
    });
    return POST(req);
  }

  // A non-invitee.created event: signature is checked first, then the handler
  // short-circuits to { received: true } without needing a tenant lookup. That
  // isolates the signature gate from the (Redis-backed) tenant resolution.
  const body = JSON.stringify({ event: "invitee.canceled", payload: {} });

  beforeEach(() => {
    vi.stubEnv("CALENDLY_WEBHOOK_SECRET", SECRET);
  });

  it("(a) rejects a request with no signature header (401)", async () => {
    const res = await post({ "content-type": "application/json" }, body);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/missing signature/i);
    expect(mockAddEvent).not.toHaveBeenCalled();
  });

  it("(b) rejects a forged signature (401)", async () => {
    const header = `t=1700000000,v1=${"0".repeat(64)}`;
    const res = await post(
      { "Calendly-Webhook-Signature": header, "content-type": "application/json" },
      body
    );
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/invalid signature/i);
    expect(mockAddEvent).not.toHaveBeenCalled();
  });

  it("(b2) rejects a signature computed over the wrong body (replay/tamper)", async () => {
    // Valid signature for a DIFFERENT payload, then send a tampered body.
    const header = calendlySignatureHeader(JSON.stringify({ event: "invitee.created" }));
    const res = await post(
      { "Calendly-Webhook-Signature": header, "content-type": "application/json" },
      body
    );
    expect(res.status).toBe(401);
    expect(mockAddEvent).not.toHaveBeenCalled();
  });

  it("(c) accepts a correctly-signed payload", async () => {
    const header = calendlySignatureHeader(body);
    const res = await post(
      { "Calendly-Webhook-Signature": header, "content-type": "application/json" },
      body
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.received).toBe(true);
    // invitee.canceled is acknowledged without creating an event.
    expect(mockAddEvent).not.toHaveBeenCalled();
  });

  it("returns 500 when the webhook secret is not configured", async () => {
    vi.stubEnv("CALENDLY_WEBHOOK_SECRET", "");
    const header = calendlySignatureHeader(body);
    const res = await post(
      { "Calendly-Webhook-Signature": header, "content-type": "application/json" },
      body
    );
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Vegaro webhook — header "X-Vegaro-Signature" (or "X-Webhook-Signature"),
// sig = HMAC-SHA256(body) hex, compared via timingSafeEqual against the hex
// digest string bytes. Hand-rolled verifier in the route.
// ---------------------------------------------------------------------------
describe("vegaro webhook signature verification", () => {
  const SECRET = "vegaro_test_secret";

  function vegaroSignature(payload: string, secret = SECRET): string {
    return crypto.createHmac("sha256", secret).update(payload).digest("hex");
  }

  async function post(headers: Record<string, string>, body: string) {
    const { POST } = await import("@/app/api/webhooks/vegaro/route");
    const req = new Request("https://admin.strelva.com/api/webhooks/vegaro", {
      method: "POST",
      headers,
      body,
    });
    return POST(req);
  }

  // A non-booking event: passes the signature gate then short-circuits to
  // { received: true } before any tenant lookup, isolating the signature gate.
  const body = JSON.stringify({ event: "booking.cancelled", data: {} });

  beforeEach(() => {
    vi.stubEnv("VEGARO_WEBHOOK_SECRET", SECRET);
  });

  it("(a) rejects a request with no signature header (401)", async () => {
    const res = await post({ "content-type": "application/json" }, body);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/missing signature/i);
    expect(mockAddEvent).not.toHaveBeenCalled();
  });

  it("(b) rejects a forged signature (401)", async () => {
    // Same byte length as a sha256 hex digest so timingSafeEqual compares
    // rather than throwing — proves a value-mismatch is still rejected.
    const forged = "a".repeat(64);
    const res = await post(
      { "X-Vegaro-Signature": forged, "content-type": "application/json" },
      body
    );
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/invalid signature/i);
    expect(mockAddEvent).not.toHaveBeenCalled();
  });

  it("(b2) rejects a signature computed with the wrong secret", async () => {
    const sig = vegaroSignature(body, "attacker_secret");
    const res = await post(
      { "X-Vegaro-Signature": sig, "content-type": "application/json" },
      body
    );
    expect(res.status).toBe(401);
    expect(mockAddEvent).not.toHaveBeenCalled();
  });

  it("(c) accepts a correctly-signed payload via X-Vegaro-Signature", async () => {
    const sig = vegaroSignature(body);
    const res = await post(
      { "X-Vegaro-Signature": sig, "content-type": "application/json" },
      body
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.received).toBe(true);
    expect(mockAddEvent).not.toHaveBeenCalled();
  });

  it("(c2) also accepts the fallback X-Webhook-Signature header", async () => {
    const sig = vegaroSignature(body);
    const res = await post(
      { "X-Webhook-Signature": sig, "content-type": "application/json" },
      body
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.received).toBe(true);
  });

  it("returns 500 when the webhook secret is not configured", async () => {
    vi.stubEnv("VEGARO_WEBHOOK_SECRET", "");
    const sig = vegaroSignature(body);
    const res = await post(
      { "X-Vegaro-Signature": sig, "content-type": "application/json" },
      body
    );
    expect(res.status).toBe(500);
  });
});
