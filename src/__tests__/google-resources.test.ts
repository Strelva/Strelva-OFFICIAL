import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetConnection = vi.hoisted(() => vi.fn());
const mockGetGoogleAccessToken = vi.hoisted(() => vi.fn());
const mockGetAnalyticsConfig = vi.hoisted(() => vi.fn());
const mockSetAnalyticsConfig = vi.hoisted(() => vi.fn());
const mockGetRedis = vi.hoisted(() => vi.fn());

vi.mock("@/lib/connections", () => ({ getConnection: mockGetConnection }));
vi.mock("@/lib/google-token", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/google-token")>(),
  getGoogleAccessToken: mockGetGoogleAccessToken,
}));
vi.mock("@/lib/analytics", () => ({
  getAnalyticsConfig: mockGetAnalyticsConfig,
  setAnalyticsConfig: mockSetAnalyticsConfig,
}));
vi.mock("@/lib/redis", () => ({ getRedis: mockGetRedis }));

import { discoverGoogleResources, selectGoogleResource } from "@/lib/google-resources";

function response(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

beforeEach(() => {
  vi.restoreAllMocks();
  mockGetConnection.mockResolvedValue({ provider: "google", tenantId: "acme", status: "connected", scopes: [
    "https://www.googleapis.com/auth/webmasters.readonly",
    "https://www.googleapis.com/auth/analytics.readonly",
    "https://www.googleapis.com/auth/business.manage",
  ] });
  mockGetGoogleAccessToken.mockResolvedValue("oauth-token");
  mockGetAnalyticsConfig.mockResolvedValue({ tenantId: "acme", gscProperty: null, ga4PropertyId: null, updatedAt: null });
  mockSetAnalyticsConfig.mockResolvedValue(undefined);
  mockGetRedis.mockReturnValue({ get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue("OK") });
});

describe("Google resource selection", () => {
  it("discovers owner-visible GSC, GA4, and GBP resources without exposing tokens", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ siteEntry: [{ siteUrl: "sc-domain:acme.test", permissionLevel: "siteOwner" }] }))
      .mockResolvedValueOnce(response({ accountSummaries: [{ name: "accountSummaries/1", displayName: "Acme account", propertySummaries: [{ property: "properties/123", displayName: "Acme web" }] }] }))
      .mockResolvedValueOnce(response({ accounts: [{ name: "accounts/9", accountName: "Acme Business" }] }))
      .mockResolvedValueOnce(response({ locations: [{ name: "accounts/9/locations/77", title: "Acme Downtown" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const catalog = await discoverGoogleResources("acme");
    expect(catalog.connection).toMatchObject({ connected: true, scopes: expect.any(Array) });
    expect(catalog.gsc.resources).toEqual([{ id: "sc-domain:acme.test", label: "sc-domain:acme.test", detail: "siteOwner" }]);
    expect(catalog.ga4.resources).toEqual([{ id: "properties/123", label: "Acme web", detail: "Acme account" }]);
    expect(catalog.gbp.resources).toEqual([{ id: "accounts/9|77", label: "Acme Downtown", detail: "accounts/9" }]);
    expect(fetchMock.mock.calls.every(([, init]) => (init as RequestInit).headers && !(init as RequestInit).headers?.toString().includes("refresh"))).toBe(true);
  });

  it("rejects a selection that was not returned by the current Google account", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ siteEntry: [] })));
    await expect(selectGoogleResource("acme", "gsc", "sc-domain:other.test")).rejects.toThrow("resource_not_available");
    expect(mockSetAnalyticsConfig).not.toHaveBeenCalled();
  });

  it("stores a verified GA4 selection normalized to the data API property id", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ siteEntry: [] }))
      .mockResolvedValueOnce(response({ accountSummaries: [{ propertySummaries: [{ property: "properties/123", displayName: "Acme web" }] }] }))
      .mockResolvedValueOnce(response({ accounts: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await selectGoogleResource("acme", "ga4", "properties/123");
    expect(mockSetAnalyticsConfig).toHaveBeenCalledWith("acme", { ga4PropertyId: "123" });
  });

  it("does not probe Google with a legacy connection that has no recorded scopes", async () => {
    mockGetConnection.mockResolvedValue({ provider: "google", tenantId: "acme", status: "connected", scopes: [] });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const catalog = await discoverGoogleResources("acme");
    expect(catalog.gsc.status).toBe("not_granted");
    expect(catalog.ga4.status).toBe("not_granted");
    expect(catalog.gbp.status).toBe("not_granted");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the exact accounts/{id}/locations path when listing GBP locations", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ siteEntry: [] }))
      .mockResolvedValueOnce(response({ accountSummaries: [] }))
      .mockResolvedValueOnce(response({ accounts: [{ name: "accounts/9", accountName: "Acme" }] }))
      .mockResolvedValueOnce(response({ locations: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await discoverGoogleResources("acme");
    expect(fetchMock.mock.calls[3]?.[0]).toBe("https://mybusinessbusinessinformation.googleapis.com/v1/accounts/9/locations?pageSize=100&readMask=name,title,storefrontAddress");
  });
});
