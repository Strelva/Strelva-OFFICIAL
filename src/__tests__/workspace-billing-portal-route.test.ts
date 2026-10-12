import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), open: vi.fn(), rate: vi.fn() }));
vi.mock("@/platform/business-billing", () => ({ businessBillingEnabled: () => process.env.STRELVA_BUSINESS_BILLING === "1" }));
vi.mock("@/platform/business-billing/workspace-portal", () => ({ openWorkspaceBillingPortal: mocks.open }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedWindowedAsync: mocks.rate }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => process.env.STRELVA_WORKSPACE_RELEASE === "1" }));
vi.mock("@/products/connected-sites/server", () => ({ appOrigin: () => "https://app.example.test" }));
vi.mock("@/platform/workspaces/http", async importOriginal => ({ ...await importOriginal<typeof import("@/platform/workspaces/http")>(), workspaceHttpActor: mocks.actor }));
import { POST } from "@/app/api/workspace/billing-portal/route";

const workspaceId = "7e000000-0000-4000-8000-000000000010";
function request(body: unknown = { workspaceId, action: "cancel" }, origin = "https://app.example.test") { return new Request("https://app.example.test/api/workspace/billing-portal", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
beforeEach(() => {
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1"); vi.stubEnv("STRELVA_BUSINESS_BILLING", "1"); vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fictional");
  mocks.actor.mockResolvedValue({ userId: "owner", verifiedEmail: "owner@example.test" }); mocks.open.mockResolvedValue("https://billing.stripe.com/p/owner"); mocks.rate.mockResolvedValue(false);
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
describe("workspace billing portal admission", () => {
  it("passes only the workspace and action to the scoped server command", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ portalUrl: "https://billing.stripe.com/p/owner" });
    expect(mocks.open).toHaveBeenCalledWith({ userId: "owner", verifiedEmail: "owner@example.test" }, workspaceId, "cancel", `https://app.example.test/workspace/billing?workspaceId=${workspaceId}`);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("preserves closed release and provider configuration gates", async () => {
    vi.stubEnv("STRELVA_BUSINESS_BILLING", "0"); expect((await POST(request())).status).toBe(503);
    vi.stubEnv("STRELVA_BUSINESS_BILLING", "1"); vi.stubEnv("STRIPE_SECRET_KEY", ""); expect((await POST(request())).status).toBe(503);
    expect(mocks.open).not.toHaveBeenCalled();
  });
  it("rejects cross-origin requests and unauthenticated callers", async () => {
    expect((await POST(request(undefined, "https://foreign.example"))).status).toBe(403);
    mocks.actor.mockResolvedValue(null); expect((await POST(request())).status).toBe(401);
    expect(mocks.open).not.toHaveBeenCalled();
  });
  it("rejects caller-selected Stripe identifiers and unsupported actions", async () => {
    expect((await POST(request({ workspaceId, action: "cancel", customerId: "cus_Foreign" }))).status).toBe(400);
    expect((await POST(request({ workspaceId, action: "delete" }))).status).toBe(400);
    expect(mocks.open).not.toHaveBeenCalled();
  });
  it("refuses rate-limited requests and reports provider failure without a portal", async () => {
    mocks.rate.mockResolvedValue(true); expect((await POST(request())).status).toBe(429); expect(mocks.open).not.toHaveBeenCalled();
    mocks.rate.mockResolvedValue(false); mocks.open.mockRejectedValue(new Error("Provider unavailable"));
    const response = await POST(request()); expect(response.status).toBe(503); expect(await response.json()).not.toHaveProperty("portalUrl");
  });
});
