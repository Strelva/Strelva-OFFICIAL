import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/v1/payments/route";

const mocks = vi.hoisted(() => ({ enabled: true, rpc: vi.fn(), checkout: vi.fn(), limit: vi.fn() }));
vi.mock("@/platform/connect", () => ({ connectEnabled: () => mocks.enabled, moneyRpc: mocks.rpc, createDirectCheckout: mocks.checkout }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedWindowedAsync: mocks.limit }));
const token = "a".repeat(64);
const digest = createHash("sha256").update(token).digest("hex");
const issued = {
  id: "c6311000-0000-4000-8000-000000000001", workspaceId: "c6311000-0000-4000-8000-000000000010",
  businessName: "Fictional business", kind: "quote", lines: [{ name: "Quoted work", quantity: 1, unitCents: 1275 }],
  amountCents: 1275, currency: "cad", expiresAt: "2026-10-20T00:00:00Z", paid: false, status: "unpaid",
  acceptedTerms: "The issued work terms.", cancellationPolicy: {},
};
function request(body: unknown = { token }, origin = "https://app.example") {
  return new Request("https://app.example/api/v1/payments", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.enabled = true; mocks.limit.mockResolvedValue(false);
  mocks.rpc.mockResolvedValue(issued); mocks.checkout.mockResolvedValue({ url: "https://checkout.example/fixture" });
});
describe("issued payment terms at API admission", () => {
  it.each([
    { kind: "quote", acceptedTerms: undefined, cancellationPolicy: undefined },
    { kind: "quote", acceptedTerms: null, cancellationPolicy: {} },
    { kind: "quote", acceptedTerms: " \t\n", cancellationPolicy: { refundable: "true" } },
    { kind: "quote", acceptedTerms: "\u00a0\ufeff", cancellationPolicy: {} },
    { kind: "deposit", acceptedTerms: "Quote terms cannot replace a deposit policy.", cancellationPolicy: {} },
    { kind: "deposit", acceptedTerms: null, cancellationPolicy: { refundable: "false" } },
  ])("holds missing issued terms before acceptance or checkout: %j", async terms => {
    mocks.rpc.mockResolvedValue({ ...issued, ...terms });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Payment terms are missing. Contact the business before paying." });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("read_public_payment_request", { p_hash: digest });
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
  it.each([
    { kind: "quote", acceptedTerms: "  Exact issued terms.  ", cancellationPolicy: {} },
    { kind: "quote", acceptedTerms: null, cancellationPolicy: { refundable: false } },
    { kind: "deposit", acceptedTerms: null, cancellationPolicy: { refundable: true } },
    { kind: "deposit", acceptedTerms: null, cancellationPolicy: { refundable: false } },
  ])("uses only the accepted issued amount and identity with valid terms: %j", async terms => {
    mocks.rpc.mockResolvedValue({ ...issued, ...terms });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.rpc.mock.calls).toEqual([
      ["read_public_payment_request", { p_hash: digest }], ["accept_public_payment_request", { p_hash: digest }],
    ]);
    expect(mocks.checkout).toHaveBeenCalledExactlyOnceWith({
      workspaceId: issued.workspaceId, idempotencyKey: `request:${issued.id}`, purpose: terms.kind,
      referenceId: issued.id, amountCents: issued.amountCents, currency: issued.currency,
      successUrl: `https://app.example/pay/business?token=${token}`, cancelUrl: `https://app.example/pay/business?token=${token}`,
    });
  });
  it("holds if atomic acceptance cannot be confirmed or returns missing terms", async () => {
    mocks.rpc.mockResolvedValueOnce(issued).mockRejectedValueOnce(new Error("payment_request_terms_required"));
    expect((await POST(request())).status).toBe(503);
    expect(mocks.checkout).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValueOnce(issued).mockResolvedValueOnce({ ...issued, acceptedTerms: null });
    expect((await POST(request())).status).toBe(409);
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
  it("reports historical paid requests without creating a new acceptance or checkout", async () => {
    mocks.rpc.mockResolvedValue({ ...issued, status: "paid", paid: true, acceptedTerms: null });
    expect(await (await POST(request())).json()).toEqual({ status: "paid" });
    expect(mocks.rpc).toHaveBeenCalledTimes(1); expect(mocks.checkout).not.toHaveBeenCalled();
  });
  it("never trusts supplied payment terms or amount", async () => {
    for (const extra of [{ acceptedTerms: "I invent these" }, { cancellationPolicy: { refundable: true } }, { amountCents: 1 }, { workspaceId: issued.workspaceId }]) {
      expect((await POST(request({ token, ...extra }))).status).toBe(400);
    }
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.checkout).not.toHaveBeenCalled();
  });
  it("keeps gates dark and same-origin/rate limits ahead of issued-term reads", async () => {
    mocks.enabled = false;
    expect((await POST(request())).status).toBe(503);
    expect((await GET(new Request(`https://app.example/api/v1/payments?token=${token}`))).status).toBe(503);
    mocks.enabled = true;
    expect((await POST(request({ token }, "https://foreign.example"))).status).toBe(403);
    mocks.limit.mockResolvedValue(true); expect((await POST(request())).status).toBe(429);
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.checkout).not.toHaveBeenCalled();
  });
});
