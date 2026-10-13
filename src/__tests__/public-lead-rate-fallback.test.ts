import { beforeEach, describe, expect, it, vi } from "vitest";

const ports = vi.hoisted(() => ({ redis: vi.fn(), tenant: vi.fn(), capture: vi.fn() }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: ports.redis }));
vi.mock("@/platform/infra/production-guard", () => ({ isProductionEnv: () => true }));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: ports.tenant }));
vi.mock("@/lib/leads", () => ({ captureLead: ports.capture }));
vi.mock("@/lib/spam-pit", () => ({ recordSpam: vi.fn() }));
vi.mock("@/platform/bookings/inquiry-offers", () => ({ captureInquiryBookingOffer: vi.fn() }));
vi.mock("@/products/inquiries", () => ({ notifyInquiryOwner: vi.fn(), inquiryDefinitionAtUse: vi.fn() }));
vi.mock("@/products/inquiries/server", () => ({
  INQUIRY_WORKSPACE_EXIT_CODE: "workspace_exit_future_work_blocked", InquiryWorkspaceExitUnavailableError: class extends Error {},
  getInquiryRepository: vi.fn(), inquiryReleaseEnabledForTenant: vi.fn(), projectPublishedInquiry: vi.fn(), recordInquiryEvidence: vi.fn(), resolveInquiryWorkspace: vi.fn(), validateInquiryFields: vi.fn(),
}));

import { POST } from "@/app/api/v1/leads/[tenant]/route";
let run = 0;
function send(tenant: string, ip = "203.0.113.8") {
  return POST(new Request(`https://app.example.test/api/v1/leads/${tenant}`, {
    method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify({ name: "Fixture Customer", email: "fixture@example.test" }),
  }), { params: Promise.resolve({ tenant }) });
}
beforeEach(() => {
  run++; vi.clearAllMocks(); ports.redis.mockReturnValue(null);
  ports.tenant.mockImplementation(async (id: string) => ({ id, active: true }));
  ports.capture.mockResolvedValue({ status: "captured", lead: { id: "fixture-lead" } });
});

describe("public lead limiter outage", () => {
  it.each(["missing", "failing"])("keeps intake available but admits only20 per process when Redis is %s", async mode => {
    if (mode === "failing") ports.redis.mockReturnValue({ incr: async () => { throw new Error("fixture outage"); } });
    const results = await Promise.all(Array.from({ length: 80 }, () => send(`outage-${run}`)));
    expect(results.filter(r => r.status === 200)).toHaveLength(20);
    expect(results.filter(r => r.status === 429)).toHaveLength(60);
    expect(ports.capture).toHaveBeenCalledTimes(20);
    const rejected = results.find(r => r.status === 429)!;
    expect(await rejected.json()).toEqual({ error: "Too many requests" });
    expect(rejected.headers.get("access-control-allow-origin")).toBe("*");
  });
  it("keeps other tenants and callers available after one fallback bucket fills", async () => {
    await Promise.all(Array.from({ length: 20 }, () => send(`outage-${run}`)));
    expect((await send(`outage-${run}`)).status).toBe(429);
    expect((await send(`other-${run}`)).status).toBe(200);
    expect((await send(`outage-${run}`, "203.0.113.9")).status).toBe(200);
    expect(ports.capture).toHaveBeenCalledTimes(22);
  });
  it("admits a new fallback window after expiry", async () => {
    await Promise.all(Array.from({ length: 20 }, () => send(`outage-${run}`)));
    expect((await send(`outage-${run}`)).status).toBe(429);
    const later = Date.now() + 60_001;
    const clock = vi.spyOn(Date, "now").mockReturnValue(later);
    try { expect((await send(`outage-${run}`)).status).toBe(200); }
    finally { clock.mockRestore(); }
    expect(ports.capture).toHaveBeenCalledTimes(21);
  });
  it("returns to the shared limiter after recovery instead of retaining an exhausted fallback", async () => {
    await Promise.all(Array.from({ length: 20 }, () => send(`outage-${run}`)));
    expect((await send(`outage-${run}`)).status).toBe(429);
    ports.redis.mockReturnValue({ incr: async () => 1, expire: async () => 1 });
    expect((await send(`outage-${run}`)).status).toBe(200);
    expect(ports.capture).toHaveBeenCalledTimes(21);
  });
});
