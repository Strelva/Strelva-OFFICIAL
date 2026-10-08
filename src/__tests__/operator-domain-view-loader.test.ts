import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DomainClaim } from "@/lib/types";
const mocks = vi.hoisted(() => ({ claims: vi.fn(), monitor: vi.fn() }));
vi.mock("@/lib/domains", () => ({ listTenantDomainClaims: mocks.claims }));
vi.mock("@/lib/domain-monitor-store", () => ({ getDomainHealth: mocks.monitor }));
import { loadDomainView } from "@/platform/operator-queue/domain-view-loader";
function claim(registrationAttempt?: DomainClaim["registrationAttempt"]): DomainClaim {
  return { tenantId: "alpha", domain: "alpha.test", role: "production", status: "pending", dnsStatus: "unknown", sslStatus: "pending",
    createdAt: "2026-10-01T12:00:00Z", updatedAt: "2026-10-06T12:00:00Z", ...(registrationAttempt ? { registrationAttempt } : {}) };
}
beforeEach(() => { vi.clearAllMocks(); mocks.monitor.mockResolvedValue(null); });
afterEach(() => vi.unstubAllEnvs());
describe("one domain projection carries hosted registration state", () => {
  it.each(["not_submitted", "unknown", "rejected", "confirmed"] as const)("preserves the %s registration_attempt already hydrated on the domain claim", async registration => {
    mocks.claims.mockResolvedValue([claim(registration)]);
    const view = await loadDomainView([{ tenantId: "alpha", label: "Alpha website" }]);
    expect(view.rows).toHaveLength(1);
    expect(view.rows[0]).toMatchObject({ domain: "alpha.test", system: "Alpha website", registration,
      verification: { status: "pending", label: "Waiting on DNS" }, uptime: null, expiry: { label: "Expiry unknown" } });
    expect(view.monitorKnown).toBe(false); expect(mocks.claims).toHaveBeenCalledWith("alpha");
  });
  it("retains legacy claims with no registration state and combines monitor evidence", async () => {
    vi.stubEnv("STRELVA_OPERATOR_QUEUE_RELEASE", "0"); mocks.claims.mockResolvedValue([claim()]);
    mocks.monitor.mockResolvedValue({ scannedAt: "2026-10-07T12:00:00Z", results: [{ tenantId: "alpha", checks: [{ host: "alpha.test", state: "up", kind: "custom", reason: null,
      expiresAt: "2026-11-06T12:00:00Z", daysToExpiry: 30, checkedAt: "2026-10-07T12:00:00Z" }] }] });
    const view = await loadDomainView([{ tenantId: "alpha", label: "Alpha website" }]);
    expect(view.rows[0]).toMatchObject({ registration: null, uptime: { state: "up", label: "Up" }, expiry: { days: 30 }, lastCheckedAt: "2026-10-07T12:00:00Z" });
    expect(view.monitorKnown).toBe(true);
  });
  it("names failure to the caller rather than projecting a successful empty domain list", async () => {
    mocks.claims.mockRejectedValue(new Error("claims unavailable"));
    await expect(loadDomainView([{ tenantId: "alpha", label: "Alpha website" }])).rejects.toThrow("claims unavailable");
  });
});
