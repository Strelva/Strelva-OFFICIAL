import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { authenticatedCronRequest } from "@/__tests__/support/cron";
import type { DomainClaim, TenantConfig } from "@/lib/types";

const deps = vi.hoisted(() => ({ release: vi.fn(), tenants: vi.fn(), all: vi.fn(), config: vi.fn(), update: vi.fn(), send: vi.fn(), heartbeat: vi.fn() }));
vi.mock("@/products/websites/rebuild-release", () => ({ websiteRebuildReleaseEnabled: deps.release }));
vi.mock("@/lib/tenants", () => ({ getActiveTenants: deps.tenants, getAllTenants: deps.all, getTenantConfig: deps.config, updateTenant: deps.update, isActiveTenant: (tenant: { active?: boolean }) => tenant.active !== false, invalidateDomainMapCache: () => undefined }));
vi.mock("@/lib/redis", () => ({ getRedis: () => null }));
vi.mock("@/lib/email/send", () => ({ sendEmailWithReceipt: deps.send }));
vi.mock("@/lib/delivery-email", () => ({ resolveLeadNotifyRecipients: () => ["operator@example.com"] }));
vi.mock("@/lib/heartbeat", () => ({ recordHeartbeat: deps.heartbeat }));
import { GET } from "@/app/api/cron/website-domain-verification/route";

const now = Date.now();
function claim(tenantId: string, domain: string, daysOld: number, status: DomainClaim["status"] = "pending"): DomainClaim {
  const at = new Date(now - daysOld * 86_400_000).toISOString();
  return { tenantId, domain, role: "production", status, dnsStatus: "unknown", sslStatus: "pending", createdAt: at, updatedAt: at };
}
// One custom-repo client and one hosted site, both on the tenant model.
const tenants: Record<string, TenantConfig> = {
  gldf: { id: "gldf", active: true, deliveryModel: "custom_repo", customDomains: ["gldf.example.test"], domainClaims: [claim("gldf", "gldf.example.test", 9)] } as unknown as TenantConfig,
  hosted: { id: "hosted", active: true, deliveryModel: "platform_template", customDomains: ["hosted.example.test"], domainClaims: [claim("hosted", "hosted.example.test", 3, "misconfigured"), claim("hosted", "done.example.test", 30, "verified")] } as unknown as TenantConfig,
};
const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("VERCEL_API_TOKEN", "test-token");
  vi.stubEnv("VERCEL_PROJECT_ID", "prj_test");
  vi.stubGlobal("fetch", fetchMock);
  deps.release.mockReturnValue(false);
  deps.tenants.mockResolvedValue(Object.values(tenants));
  deps.all.mockResolvedValue(Object.values(tenants));
  deps.config.mockImplementation(async (id: string) => tenants[id] ?? null);
  deps.update.mockImplementation(async (id: string, patch: Partial<TenantConfig>) => ({ ...tenants[id], ...patch }));
  deps.send.mockResolvedValue({ status: "accepted" });
  fetchMock.mockImplementation(async (url: string) => new Response(JSON.stringify(String(url).includes("/config") ? { misconfigured: true } : { name: "x", verified: false }), { status: 200 }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("domain verification cron over every site", () => {
  it("polls custom-repo and hosted claims with the rebuild release off, reading Vercel only", async () => {
    const response = await GET(authenticatedCronRequest());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ pending: 2, processed: 2, refreshed: 2, mode: "report_only", alerted: 0 });
    const polled = fetchMock.mock.calls.map(([url]) => String(url));
    expect(polled.some((url) => url.includes("gldf.example.test"))).toBe(true);
    expect(polled.some((url) => url.includes("hosted.example.test"))).toBe(true);
    expect(polled.some((url) => url.includes("done.example.test"))).toBe(false);
    // Read-only toward Vercel: no POST, PATCH or DELETE was sent.
    for (const [, init] of fetchMock.mock.calls) expect((init as RequestInit | undefined)?.method ?? "GET").toBe("GET");
    // Report-only: the seven-day claim did not email anyone.
    expect(deps.send).not.toHaveBeenCalled();
    expect(deps.update).toHaveBeenCalledWith("gldf", expect.objectContaining({ domainClaims: expect.any(Array) }));
    expect(deps.heartbeat).toHaveBeenCalledWith("website-domain-verification", expect.objectContaining({ ok: true, processed: 2 }));
  });

  it("keeps the seven-day operator email when the rebuild release is on", async () => {
    deps.release.mockReturnValue(true);
    const body = await (await GET(authenticatedCronRequest())).json();
    expect(body).toMatchObject({ mode: "alerting", alerted: 1 });
    expect(deps.send).toHaveBeenCalledWith(expect.objectContaining({ audience: "operator" }));
  });

  it("skips without a provider token and reports a provider failure as failed, not verified", async () => {
    vi.stubEnv("VERCEL_API_TOKEN", "");
    expect(await (await GET(authenticatedCronRequest())).json()).toMatchObject({ skipped: true, reason: "domain_provider_disabled" });
    vi.stubEnv("VERCEL_API_TOKEN", "test-token");
    deps.update.mockResolvedValue(null);
    const response = await GET(authenticatedCronRequest());
    expect(response.status).toBe(207);
    expect(await response.json()).toMatchObject({ failed: 2, refreshed: 0 });
    expect(deps.heartbeat).toHaveBeenLastCalledWith("website-domain-verification", expect.objectContaining({ ok: false }));
  });
});
