import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SiteHealthSnapshot } from "@/platform/operator-queue/site-coverage";
const deps = vi.hoisted(() => ({ redis: vi.fn(), db: vi.fn(), members: vi.fn(), get: vi.fn(), digests: vi.fn(), drafts: vi.fn(), health: vi.fn(), ops: vi.fn() }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: deps.redis }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: deps.db }));
vi.mock("@/lib/maintenance-digest", () => ({ listPendingDigests: deps.digests }));
vi.mock("@/lib/storage", () => ({ listDrafts: deps.drafts }));
vi.mock("@/platform/operator-queue/site-health-store", () => ({ readSiteHealth: deps.health }));
vi.mock("@/lib/ops", () => ({ buildOpsReport: deps.ops }));
import { readMaintenanceDigests, readOpsAlerts, readSiteDrafts, readSiteHealthItems } from "@/platform/operator-queue/sources";
const NOW = Date.parse("2026-10-07T12:00:00Z");
const DAY = 86_400_000;
const digest = { tenant: "alpha", siteName: "Alpha", weekOf: "2026-10-01", items: [], status: "pending", createdAt: "2026-10-01T12:00:00Z" };
const tenants = new Map([["alpha", { id: "alpha", siteName: "Alpha" }], ["new", { id: "new", siteName: "New" }]]);
function snapshot(checkedAt = NOW): SiteHealthSnapshot {
  return { checkedAt: new Date(checkedAt).toISOString(), results: [{ tenantId: "alpha", stableId: null, siteName: "Alpha", deliveryModel: "custom_repo", status: "healthy", reasons: [], lastVerifiedAt: new Date(checkedAt).toISOString(), stale: false, domainEvidence: "domain-monitor" }] };
}
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("STRELVA_OPERATOR_QUEUE_RELEASE", "1"); vi.stubEnv("DATA_SOURCE", "postgres");
  deps.redis.mockReturnValue({ smembers: deps.members, get: deps.get }); deps.members.mockResolvedValue(["alpha"]); deps.get.mockResolvedValue(digest);
  deps.digests.mockResolvedValue([digest]); deps.drafts.mockResolvedValue({ hero: true }); deps.health.mockResolvedValue(snapshot());
});
afterEach(() => vi.unstubAllEnvs());
describe("operator source integrity", () => {
  it("reads operations directly, retaining per-business failures and naming an outage", async () => {
    deps.ops.mockResolvedValue({ timestamp: "2026-10-07T12:00:00Z", revalidationFailures: [{ tenantId: "alpha", timestamp: "2026-10-07T10:00:00Z", error: "failed" }],
      metrics: { webhookFailures: 1, failedAiWriteItems: [], domainDrift: [] } });
    const result = await readOpsAlerts(); expect(result).toMatchObject({ ok: true, rows: [{ tenantId: null }, { tenantId: "alpha", openedAt: "2026-10-07T10:00:00Z" }] });
    expect(deps.ops).toHaveBeenCalledWith({ requireStore: true });
    deps.ops.mockRejectedValue(new Error("Redis unavailable")); expect(await readOpsAlerts()).toMatchObject({ ok: false, source: "Operations alerts", reason: "Redis unavailable" });
  });
  it("reads every indexed digest strictly and names an index or blob failure", async () => {
    expect(await readMaintenanceDigests()).toMatchObject({ ok: true, rows: [{ sourceRef: "alpha:2026-10-01" }] });
    expect(deps.digests).not.toHaveBeenCalled();
    deps.members.mockRejectedValue(new Error("Redis index unavailable")); expect(await readMaintenanceDigests()).toMatchObject({ ok: false, reason: "Redis index unavailable" });
    deps.members.mockResolvedValue(["alpha"]); deps.get.mockRejectedValue(new Error("Redis blob unavailable")); expect(await readMaintenanceDigests()).toMatchObject({ ok: false, reason: "Redis blob unavailable" });
  });
  it("reports malformed digest data and permits a concurrent source closure", async () => {
    deps.get.mockResolvedValue("{bad json"); expect((await readMaintenanceDigests()).ok).toBe(false);
    deps.get.mockResolvedValue({ ...digest, tenant: "other" }); expect((await readMaintenanceDigests()).ok).toBe(false);
    deps.get.mockResolvedValue(null); expect(await readMaintenanceDigests()).toMatchObject({ ok: true, rows: [] });
    deps.get.mockResolvedValue({ ...digest, status: "approved" }); expect(await readMaintenanceDigests()).toMatchObject({ ok: true, rows: [] });
  });
  it("keeps the legacy digest and draft helper paths while off", async () => {
    vi.stubEnv("STRELVA_OPERATOR_QUEUE_RELEASE", "0");
    expect((await readMaintenanceDigests()).ok).toBe(true); expect(deps.digests).toHaveBeenCalledOnce(); expect(deps.members).not.toHaveBeenCalled();
    expect((await readSiteDrafts([...tenants.values()], NOW)).ok).toBe(true); expect(deps.drafts).toHaveBeenCalledTimes(2); expect(deps.db).not.toHaveBeenCalled();
  });
  it("uses the persisted draft creation date and reports Postgres failures without dev fallback", async () => {
    const range = vi.fn().mockResolvedValue({ data: [{ section: "hero", created_at: digest.createdAt }], error: null });
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range };
    deps.db.mockReturnValue({ from: vi.fn().mockReturnValue(query) });
    expect(await readSiteDrafts([{ id: "alpha" }], NOW)).toMatchObject({ ok: true, rows: [{ sourceRef: "alpha:hero", openedAt: digest.createdAt }] });
    range.mockResolvedValue({ data: null, error: { message: "unavailable" } }); expect((await readSiteDrafts([{ id: "alpha" }], NOW)).ok).toBe(false);
    deps.db.mockReturnValue(null); expect(await readSiteDrafts([{ id: "alpha" }], NOW)).toMatchObject({ ok: false, reason: "Postgres unavailable" });
    expect(deps.drafts).not.toHaveBeenCalled();
  });
  it("a stale healthy snapshot and a newly added site both show unknown evidence", async () => {
    deps.health.mockResolvedValue(snapshot(NOW - 3 * DAY));
    expect(await readSiteHealthItems(null, tenants, NOW)).toMatchObject({ ok: true, rows: [
      { sourceRef: "site:alpha", facts: { healthStatus: "unknown" }, title: "Alpha: no recent evidence" },
      { sourceRef: "site:new", facts: { healthStatus: "unknown" }, title: "New: no recent evidence" },
    ] });
    deps.health.mockResolvedValue(snapshot());
    expect(await readSiteHealthItems(null, tenants, NOW)).toMatchObject({ ok: true, rows: [{ sourceRef: "site:new", facts: { healthStatus: "unknown" } }] });
    vi.stubEnv("STRELVA_OPERATOR_QUEUE_RELEASE", "0"); deps.health.mockResolvedValue(snapshot(NOW - 3 * DAY));
    expect(await readSiteHealthItems(null, tenants, NOW)).toMatchObject({ ok: true, rows: [] });
  });
  it("names a missing or failed health run rather than claiming an empty healthy source", async () => {
    deps.health.mockResolvedValue(null); expect((await readSiteHealthItems(null, tenants, NOW)).ok).toBe(false);
    deps.health.mockRejectedValue(new Error("health unavailable")); expect(await readSiteHealthItems(null, tenants, NOW)).toMatchObject({ ok: false, reason: "health unavailable" });
  });
});
