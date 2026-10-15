import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), start: vi.fn(), limited: vi.fn(), stripe: vi.fn() }));
vi.mock("@/platform/agency-pay-links/public", () => ({ resolvePublicPayLink: mocks.resolve }));
vi.mock("@/platform/agency-pay-links/checkout", () => ({ startAgencyPayLinkCheckout: mocks.start }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedAsync: mocks.limited, rateLimitKey: (_req: unknown, prefix: string) => `key:${prefix}` }));
vi.mock("@/lib/billing", () => ({ getStripe: mocks.stripe }));
import { POST } from "@/app/api/pay/[slug]/route";
import { AgencyPayLinkClosedError } from "@/platform/agency-pay-links";
import { PayLinkValidationError } from "@/platform/infra/pay-links";
import { WorkspaceStoreError } from "@/platform/workspaces/types";

const req = (body: unknown = { amount: "500" }) => new NextRequest("http://localhost/api/pay/harbor-site", { method: "POST", headers: { "Content-Type": "application/json", host: "strelva.com" }, body: JSON.stringify(body) });
const ctx = { params: Promise.resolve({ slug: "harbor-site" }) };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.limited.mockResolvedValue(false);
  mocks.resolve.mockResolvedValue({ kind: "connected", link: { slug: "harbor-site" } });
});

describe("POST /api/pay/[slug] for a connected link", () => {
  it("returns the agency checkout and never touches the platform Stripe account", async () => {
    mocks.start.mockResolvedValue({ checkoutUrl: "https://checkout.stripe.com/pay/cs_1" });
    const res = await POST(req(), ctx);
    expect(await res.json()).toEqual({ checkoutUrl: "https://checkout.stripe.com/pay/cs_1" });
    expect(mocks.start).toHaveBeenCalledWith({ slug: "harbor-site", submittedAmount: "500", origin: expect.any(String) });
    expect(mocks.stripe).not.toHaveBeenCalled();
  });
  it("answers a closed link with its status and words", async () => {
    mocks.start.mockRejectedValue(new AgencyPayLinkClosedError("This payment link has expired. Ask the agency for a new link. Nothing was charged.", 410));
    const res = await POST(req(), ctx);
    expect(res.status).toBe(410);
    expect((await res.json()).error).toContain("expired");
  });
  it("answers an amount the link refuses with 400", async () => {
    mocks.start.mockRejectedValue(new PayLinkValidationError("Choose an amount this payment link allows."));
    expect((await POST(req(), ctx)).status).toBe(400);
  });
  it("says the agency cannot take payments when its merchant is not ready", async () => {
    mocks.start.mockRejectedValue(new WorkspaceStoreError("The merchant is not ready to accept payments."));
    const res = await POST(req(), ctx);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("This agency cannot take payments right now. Nothing was charged.");
  });
  it("never echoes an unexpected error", async () => {
    mocks.start.mockRejectedValue(new Error("connection string postgres://secret"));
    const res = await POST(req(), ctx);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret");
  });
  it("is not found when nothing resolves", async () => {
    mocks.resolve.mockResolvedValue(null);
    expect((await POST(req(), ctx)).status).toBe(404);
    expect(mocks.start).not.toHaveBeenCalled();
  });
});
