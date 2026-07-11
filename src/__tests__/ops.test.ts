import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetRedis = vi.hoisted(() => vi.fn());
const mockGetAllTenants = vi.hoisted(() => vi.fn());
const mockGetTenantConfig = vi.hoisted(() => vi.fn());
const mockGetTenantPrimaryDomain = vi.hoisted(() => vi.fn());
const mockGetRecentFailures = vi.hoisted(() => vi.fn());
const mockGetEvents = vi.hoisted(() => vi.fn());
const mockGetQueueCount = vi.hoisted(() => vi.fn());

vi.mock("@/lib/redis", () => ({ getRedis: mockGetRedis }));
vi.mock("@/lib/tenants", () => ({ getAllTenants: mockGetAllTenants, getTenantConfig: mockGetTenantConfig }));
vi.mock("@/lib/tenant-urls", () => ({ getTenantPrimaryDomain: mockGetTenantPrimaryDomain }));
vi.mock("@/lib/revalidate-client", () => ({ getRecentFailures: mockGetRecentFailures }));
vi.mock("@/lib/events", () => ({ getEvents: mockGetEvents, getQueueCount: mockGetQueueCount }));

import { buildOpsReport } from "@/lib/ops";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAllTenants.mockResolvedValue([
    { id: "a", active: true },
    { id: "b", active: true },
    { id: "old", active: false },
  ]);
  mockGetRecentFailures.mockResolvedValue([]);
  mockGetTenantConfig.mockResolvedValue({ id: "a" });
  mockGetTenantPrimaryDomain.mockReturnValue("greatlakesdriedfruit.com");
  mockGetEvents.mockResolvedValue([]);
  mockGetQueueCount.mockResolvedValue(0);
  mockGetRedis.mockReturnValue(null);
});

describe("buildOpsReport", () => {
  it("counts only active tenants and degrades without Redis", async () => {
    const report = await buildOpsReport();
    expect(report.activeTenants).toBe(2);
    expect(report.metrics.webhookFailures).toBe(0);
  });

  it("surfaces revalidation failures from getRecentFailures", async () => {
    mockGetRecentFailures.mockResolvedValue([
      { tenantId: "a", url: "x", error: "boom", timestamp: "t", attempts: 3 },
    ]);
    const report = await buildOpsReport();
    expect(report.metrics.revalidationFailures).toBe(1);
    expect(report.revalidationFailures).toHaveLength(1);
  });

  it("aggregates pending queue and failed AI writes per tenant", async () => {
    mockGetQueueCount.mockImplementation((id: string) => Promise.resolve(id === "a" ? 3 : 0));
    mockGetEvents.mockResolvedValue([
      { type: "content_update", metadata: { error: "nope" } },
      { type: "content_update", metadata: {} },
    ]);
    const report = await buildOpsReport();
    expect(report.metrics.totalPendingEvents).toBe(3);
    expect(report.metrics.pendingEvents).toEqual({ a: 3 });
    // one failed AI write per active tenant (2)
    expect(report.metrics.failedAiWrites).toBe(2);
  });

  it("flags domain drift for a domain missing from CUSTOM_DOMAIN_MAP", async () => {
    const original = process.env.CUSTOM_DOMAIN_MAP;
    process.env.CUSTOM_DOMAIN_MAP = "{}";
    const report = await buildOpsReport();
    expect(report.metrics.tenantDomainDrift.length).toBeGreaterThan(0);
    if (original === undefined) delete process.env.CUSTOM_DOMAIN_MAP;
    else process.env.CUSTOM_DOMAIN_MAP = original;
  });

  it("carries the tenant on each structured domainDrift row for deep-linking", async () => {
    const original = process.env.CUSTOM_DOMAIN_MAP;
    process.env.CUSTOM_DOMAIN_MAP = "{}";
    const report = await buildOpsReport();
    const drift = report.metrics.domainDrift ?? [];
    expect(drift.length).toBeGreaterThan(0);
    expect(drift.every((d) => typeof d.tenantId === "string" && d.tenantId.length > 0)).toBe(true);
    // the message list mirrors the structured rows one-for-one
    expect(report.metrics.tenantDomainDrift).toEqual(drift.map((d) => d.message));
    if (original === undefined) delete process.env.CUSTOM_DOMAIN_MAP;
    else process.env.CUSTOM_DOMAIN_MAP = original;
  });
});
