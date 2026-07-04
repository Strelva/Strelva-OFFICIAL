import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetRedis = vi.hoisted(() => vi.fn());
const mockGetTenantConfig = vi.hoisted(() => vi.fn());
const mockGetCredential = vi.hoisted(() => vi.fn());
const mockGetAccessToken = vi.hoisted(() => vi.fn());
const mockGetGoogleScopeGrants = vi.hoisted(() => vi.fn());
const mockGetGoogleAccessToken = vi.hoisted(() => vi.fn());

vi.mock("@/lib/redis", () => ({ getRedis: mockGetRedis }));
vi.mock("@/lib/tenants", () => ({
  getTenantConfig: (...a: unknown[]) => mockGetTenantConfig(...a),
}));
vi.mock("@/lib/search-console", () => ({
  getServiceAccountCredential: (...a: unknown[]) => mockGetCredential(...a),
  getAccessToken: (...a: unknown[]) => mockGetAccessToken(...a),
}));
vi.mock("@/lib/google-token", () => ({
  getGoogleScopeGrants: (...a: unknown[]) => mockGetGoogleScopeGrants(...a),
  getGoogleAccessToken: (...a: unknown[]) => mockGetGoogleAccessToken(...a),
}));

import {
  getAnalyticsConfig,
  setAnalyticsConfig,
  getSearchConsolePerf,
  getGa4Perf,
} from "@/lib/analytics";

/** A Map-backed fake of the Upstash client (get/set of JSON objects). */
function fakeRedis() {
  const store = new Map<string, unknown>();
  return {
    store,
    get: vi.fn(async (key: string) => (store.has(key) ? store.get(key) : null)),
    set: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
      return "OK";
    }),
  };
}

const CRED = { client_email: "svc@strelva.iam.gserviceaccount.com", private_key: "pk" };

beforeEach(() => {
  vi.restoreAllMocks();
  mockGetRedis.mockReturnValue(fakeRedis());
  mockGetTenantConfig.mockResolvedValue({ id: "gldf", siteUrl: "https://www.gldf.com" });
  mockGetCredential.mockReturnValue(CRED);
  mockGetAccessToken.mockResolvedValue("token-123");
  // Default: no tenant OAuth connection → every read uses the service account.
  mockGetGoogleScopeGrants.mockResolvedValue({
    connected: false,
    hasGscScope: false,
    hasGa4Scope: false,
  });
  mockGetGoogleAccessToken.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("analytics config", () => {
  it("defaults gscProperty from the tenant's siteUrl when unset", async () => {
    const cfg = await getAnalyticsConfig("gldf");
    expect(cfg).toEqual({
      tenantId: "gldf",
      gscProperty: "sc-domain:gldf.com",
      ga4PropertyId: null,
      updatedAt: null,
    });
  });

  it("degrades to defaults without Redis", async () => {
    mockGetRedis.mockReturnValue(null);
    const cfg = await getAnalyticsConfig("gldf");
    expect(cfg.gscProperty).toBe("sc-domain:gldf.com");
    expect(cfg.ga4PropertyId).toBeNull();
  });

  it("roundtrips set -> get through Redis", async () => {
    const redis = fakeRedis();
    mockGetRedis.mockReturnValue(redis);

    const written = await setAnalyticsConfig("gldf", {
      gscProperty: "sc-domain:custom.com",
      ga4PropertyId: "123456789",
    });
    expect(written.gscProperty).toBe("sc-domain:custom.com");
    expect(written.ga4PropertyId).toBe("123456789");
    expect(written.updatedAt).not.toBeNull();

    const read = await getAnalyticsConfig("gldf");
    expect(read.gscProperty).toBe("sc-domain:custom.com");
    expect(read.ga4PropertyId).toBe("123456789");
    expect(read.updatedAt).toBe(written.updatedAt);
  });

  it("preserves unpatched fields and re-derives gsc default when patched to null", async () => {
    const redis = fakeRedis();
    mockGetRedis.mockReturnValue(redis);

    await setAnalyticsConfig("gldf", { ga4PropertyId: "999" });
    const cfg = await getAnalyticsConfig("gldf");
    expect(cfg.ga4PropertyId).toBe("999");
    // gsc never set -> still derived from siteUrl
    expect(cfg.gscProperty).toBe("sc-domain:gldf.com");
  });
});

describe("getSearchConsolePerf", () => {
  it("returns unconfigured when there is no gsc property", async () => {
    mockGetTenantConfig.mockResolvedValue({ id: "gldf" }); // no siteUrl -> no default
    const perf = await getSearchConsolePerf("gldf");
    expect(perf.status).toBe("unconfigured");
    expect(perf.clicks).toBe(0);
    expect(perf.topQueries).toEqual([]);
  });

  it("returns ok with computed totals on a successful fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          rows: [
            { keys: ["plumber near me"], clicks: 8, impressions: 100, position: 3.2 },
            { keys: ["emergency plumber"], clicks: 2, impressions: 100, position: 5.8 },
          ],
        }),
      }))
    );

    const perf = await getSearchConsolePerf("gldf");
    expect(perf.status).toBe("ok");
    expect(perf.clicks).toBe(10);
    expect(perf.impressions).toBe(200);
    expect(perf.ctr).toBe(0.05);
    expect(perf.position).toBe(4.5);
    expect(perf.topQueries).toHaveLength(2);
    expect(perf.topQueries[0]).toEqual({
      query: "plumber near me",
      clicks: 8,
      impressions: 100,
      position: 3.2,
    });
  });

  it("returns unavailable when the fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );
    const perf = await getSearchConsolePerf("gldf");
    expect(perf.status).toBe("unavailable");
    expect(perf.clicks).toBe(0);
    expect(perf.topQueries).toEqual([]);
  });

  it("returns unavailable when there is no credential", async () => {
    mockGetCredential.mockReturnValue(null);
    const perf = await getSearchConsolePerf("gldf");
    expect(perf.status).toBe("unavailable");
  });
});

describe("getGa4Perf", () => {
  it("returns unconfigured when there is no ga4 property", async () => {
    const perf = await getGa4Perf("gldf");
    expect(perf.status).toBe("unconfigured");
    expect(perf.users).toBe(0);
    expect(perf.topPages).toEqual([]);
  });

  it("returns ok with parsed reports on a successful fetch", async () => {
    const redis = fakeRedis();
    mockGetRedis.mockReturnValue(redis);
    await setAnalyticsConfig("gldf", { ga4PropertyId: "123456789" });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          reports: [
            { rows: [{ metricValues: [{ value: "42" }, { value: "55" }, { value: "130" }] }] },
            {
              rows: [
                { dimensionValues: [{ value: "/" }], metricValues: [{ value: "80" }] },
                { dimensionValues: [{ value: "/book" }], metricValues: [{ value: "50" }] },
              ],
            },
            {
              rows: [
                { dimensionValues: [{ value: "google" }], metricValues: [{ value: "30" }] },
                { dimensionValues: [{ value: "(direct)" }], metricValues: [{ value: "25" }] },
              ],
            },
          ],
        }),
      }))
    );

    const perf = await getGa4Perf("gldf");
    expect(perf.status).toBe("ok");
    expect(perf.users).toBe(42);
    expect(perf.sessions).toBe(55);
    expect(perf.pageviews).toBe(130);
    expect(perf.topPages).toEqual([
      { path: "/", views: 80 },
      { path: "/book", views: 50 },
    ]);
    expect(perf.topSources).toEqual([
      { source: "google", sessions: 30 },
      { source: "(direct)", sessions: 25 },
    ]);
  });

  it("returns unavailable when the fetch throws", async () => {
    const redis = fakeRedis();
    mockGetRedis.mockReturnValue(redis);
    await setAnalyticsConfig("gldf", { ga4PropertyId: "123456789" });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("boom");
      })
    );
    const perf = await getGa4Perf("gldf");
    expect(perf.status).toBe("unavailable");
    expect(perf.users).toBe(0);
    expect(perf.topPages).toEqual([]);
  });
});

describe("OAuth-first token selection", () => {
  // The file-level beforeEach uses restoreAllMocks (implementations) but not
  // clearAllMocks (call history), so reset call counts here for the
  // toHaveBeenCalled / not.toHaveBeenCalled assertions below.
  beforeEach(() => {
    mockGetCredential.mockClear();
    mockGetAccessToken.mockClear();
    mockGetGoogleAccessToken.mockClear();
    mockGetGoogleScopeGrants.mockClear();
  });

  /** Capture the Authorization header the fetch was called with. */
  function stubFetch(json: unknown) {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => json }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }
  const authOf = (fetchMock: ReturnType<typeof vi.fn>) =>
    (fetchMock.mock.calls[0][1] as { headers: Record<string, string> }).headers
      .Authorization;

  it("GSC: uses the tenant OAuth token when the GSC scope was granted", async () => {
    mockGetGoogleScopeGrants.mockResolvedValue({
      connected: true,
      hasGscScope: true,
      hasGa4Scope: false,
    });
    mockGetGoogleAccessToken.mockResolvedValue("oauth-gsc-token");
    const fetchMock = stubFetch({ rows: [] });

    const perf = await getSearchConsolePerf("gldf");

    expect(perf.status).toBe("ok");
    expect(authOf(fetchMock)).toBe("Bearer oauth-gsc-token");
    // OAuth satisfied the read — the service account was never consulted.
    expect(mockGetCredential).not.toHaveBeenCalled();
  });

  it("GSC: falls back to the service account when the tenant has no connection", async () => {
    // Default beforeEach grants are all false (no connection).
    const fetchMock = stubFetch({ rows: [] });

    const perf = await getSearchConsolePerf("gldf");

    expect(perf.status).toBe("ok");
    expect(authOf(fetchMock)).toBe("Bearer token-123");
    expect(mockGetGoogleAccessToken).not.toHaveBeenCalled();
    expect(mockGetCredential).toHaveBeenCalled();
  });

  it("GSC: falls back to the service account when connected but scope not granted (pre-scope connection)", async () => {
    mockGetGoogleScopeGrants.mockResolvedValue({
      connected: true,
      hasGscScope: false, // connected before GSC scope was added, hasn't reconnected
      hasGa4Scope: false,
    });
    const fetchMock = stubFetch({ rows: [] });

    const perf = await getSearchConsolePerf("gldf");

    expect(perf.status).toBe("ok");
    expect(authOf(fetchMock)).toBe("Bearer token-123");
    expect(mockGetGoogleAccessToken).not.toHaveBeenCalled();
  });

  it("GSC: unavailable when OAuth refresh fails and there is no service account", async () => {
    mockGetGoogleScopeGrants.mockResolvedValue({
      connected: true,
      hasGscScope: true,
      hasGa4Scope: false,
    });
    mockGetGoogleAccessToken.mockResolvedValue(null); // refresh failed
    mockGetCredential.mockReturnValue(null); // no service-account access either

    const perf = await getSearchConsolePerf("gldf");

    expect(perf.status).toBe("unavailable");
  });

  it("GA4: uses the tenant OAuth token when the GA4 scope was granted", async () => {
    const redis = fakeRedis();
    mockGetRedis.mockReturnValue(redis);
    await setAnalyticsConfig("gldf", { ga4PropertyId: "123456789" });

    mockGetGoogleScopeGrants.mockResolvedValue({
      connected: true,
      hasGscScope: false,
      hasGa4Scope: true,
    });
    mockGetGoogleAccessToken.mockResolvedValue("oauth-ga4-token");
    const fetchMock = stubFetch({ reports: [] });

    const perf = await getGa4Perf("gldf");

    expect(perf.status).toBe("ok");
    expect(authOf(fetchMock)).toBe("Bearer oauth-ga4-token");
    expect(mockGetCredential).not.toHaveBeenCalled();
  });
});
