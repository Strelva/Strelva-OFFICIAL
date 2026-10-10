import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GoogleTenantOperation } from "@/lib/google-access";
const mocks = vi.hoisted(() => ({ begin: vi.fn(), commit: vi.fn(), legacy: vi.fn(), grant: vi.fn(), location: vi.fn(), token: vi.fn(), analytics: vi.fn(), saveAnalytics: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/google-access", () => ({ beginGoogleTenantOperation: mocks.begin, recordAuthorizedGoogleLocationSelection: mocks.commit, recordGoogleLocationSelection: mocks.legacy, getGoogleGrant: mocks.grant, getGoogleLocation: mocks.location, googleLocationIdFromName: (name: string) => name.split("/").at(-1) }));
vi.mock("@/lib/google-token", () => ({ GSC_READ_SCOPE: "gsc-read", GA4_READ_SCOPE: "ga4-read", getGoogleAccessToken: mocks.token }));
vi.mock("@/lib/gbp-replies", () => ({ GBP_WRITE_SCOPE: "gbp-write" }));
vi.mock("@/lib/analytics", () => ({ getAnalyticsConfig: mocks.analytics, setAnalyticsConfig: mocks.saveAnalytics }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => { throw new Error("Ambient database access is forbidden."); } }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => { throw new Error("Ambient Redis access is forbidden."); } }));
import { selectGoogleResource } from "@/lib/google-resources";
const actor = { userId: "bb000000-0000-4000-8000-000000000001", verifiedEmail: "editor@example.test" };
const operation = { tenantId: "fictional-tenant", workspaceId: "bb000000-0000-4000-8000-000000000002", tenantStableId: "bb000000-0000-4000-8000-000000000003", bindingId: "bb000000-0000-4000-8000-000000000004", bindingUpdatedAt: "2026-10-09T00:00:00.000Z", locationDigest: "a".repeat(64), startedAt: "2026-10-09T00:01:00.000Z" } satisfies GoogleTenantOperation;
const select = () => selectGoogleResource(operation.tenantId, "gbp", "accounts/exact|exact-place", actor);
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal("fetch", mocks.fetch);
  mocks.begin.mockResolvedValue(operation); mocks.commit.mockResolvedValue({ binding: "updated" });
  mocks.legacy.mockImplementation(() => { throw new Error("Ungoverned location mutation must never run."); });
  mocks.grant.mockResolvedValue({ status: "connected", scopes: ["gbp-write", "gsc-read", "ga4-read"] });
  mocks.token.mockResolvedValue("fictional-access"); mocks.location.mockResolvedValue(null);
  mocks.analytics.mockResolvedValue({ gscProperty: null, ga4PropertyId: null });
  mocks.fetch.mockImplementation(async (url: string) => {
    if (url.includes("webmasters/v3/sites")) return Response.json({ siteEntry: [{ siteUrl: "sc-domain:fictional.test" }] });
    if (url.includes("accountSummaries")) return Response.json({ accountSummaries: [{ propertySummaries: [{ property: "properties/exact", displayName: "Exact analytics" }] }] });
    if (url.includes("accountmanagement")) return Response.json({ accounts: [{ name: "accounts/exact", accountName: "Exact account" }] });
    if (url.includes("/accounts/exact/locations?")) return Response.json({ locations: [{ name: "locations/exact-place", title: "Exact place" }] });
    throw new Error("Unexpected resource fixture URL.");
  });
});
afterEach(() => { vi.unstubAllGlobals(); });
describe("interactive GBP selection operation authority", () => {
  it("captures the operation before discovery and commits only the provider-returned exact place with that original actor/pin", async () => {
    await select();
    expect(mocks.begin).toHaveBeenCalledExactlyOnceWith(operation.tenantId, actor);
    expect(mocks.begin.mock.invocationCallOrder[0]).toBeLessThan(mocks.grant.mock.invocationCallOrder[0]!);
    expect(mocks.begin.mock.invocationCallOrder[0]).toBeLessThan(mocks.token.mock.invocationCallOrder[0]!);
    expect(mocks.begin.mock.invocationCallOrder[0]).toBeLessThan(mocks.fetch.mock.invocationCallOrder[0]!);
    expect(mocks.commit).toHaveBeenCalledExactlyOnceWith(operation.tenantId, { accountId: "accounts/exact", locationId: "exact-place", title: "Exact place" }, actor, operation);
    expect(mocks.legacy).not.toHaveBeenCalled(); expect(mocks.saveAnalytics).not.toHaveBeenCalled();
  });
  it("rejects GBP without a real actor before discovery", async () => {
    await expect(selectGoogleResource(operation.tenantId, "gbp", "accounts/exact|exact-place")).rejects.toThrow("google_settings_permission_denied");
    expect(mocks.begin).not.toHaveBeenCalled(); expect(mocks.grant).not.toHaveBeenCalled(); expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.commit).not.toHaveBeenCalled();
  });
  it("does not discover or fall back when qualified durable authority is unavailable", async () => {
    mocks.begin.mockRejectedValue(new Error("persistence_unavailable")); await expect(select()).rejects.toThrow("persistence_unavailable");
    expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.token).not.toHaveBeenCalled(); expect(mocks.commit).not.toHaveBeenCalled(); expect(mocks.legacy).not.toHaveBeenCalled();
  });
  it.each(["google_settings_permission_denied", "google_operation_superseded"])("rejects %s at commit after discovery without recapturing or falling back", async reason => {
    mocks.commit.mockRejectedValue(new Error(reason)); await expect(select()).rejects.toThrow(reason);
    expect(mocks.fetch).toHaveBeenCalledTimes(4); expect(mocks.begin).toHaveBeenCalledOnce();
    expect(mocks.commit).toHaveBeenCalledWith(operation.tenantId, expect.objectContaining({ locationId: "exact-place" }), actor, operation);
    expect(mocks.legacy).not.toHaveBeenCalled(); expect(mocks.saveAnalytics).not.toHaveBeenCalled();
  });
  it("rejects an undiscovered place without committing metadata", async () => {
    await expect(selectGoogleResource(operation.tenantId, "gbp", "accounts/exact|foreign-place", actor)).rejects.toThrow("resource_not_available");
    expect(mocks.commit).not.toHaveBeenCalled(); expect(mocks.legacy).not.toHaveBeenCalled();
  });
  it.each(["gsc", "ga4"] as const)("preserves %s selection without entering the GBP operation boundary", async kind => {
    await selectGoogleResource(operation.tenantId, kind, kind === "gsc" ? "sc-domain:fictional.test" : "properties/exact");
    expect(mocks.saveAnalytics).toHaveBeenCalledExactlyOnceWith(operation.tenantId, kind === "gsc" ? { gscProperty: "sc-domain:fictional.test" } : { ga4PropertyId: "exact" });
    expect(mocks.begin).not.toHaveBeenCalled(); expect(mocks.commit).not.toHaveBeenCalled(); expect(mocks.legacy).not.toHaveBeenCalled();
  });
});
