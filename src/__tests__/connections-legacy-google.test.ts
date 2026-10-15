import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({
  tenants: [] as Array<{ id: string; stable_id: string; site_name: string }>,
  links: [] as Array<{ tenant_stable_id: string }>,
  records: new Map<string, unknown>(),
  bindings: [] as Array<{ id: string; status: string; created_at: string }>,
}));

vi.mock("@/platform/infra/db/client", () => ({
  getSupabase: () => ({
    from(table: string) {
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = () => builder;
      builder.in = () => builder;
      builder.then = (resolve: (value: unknown) => unknown) => resolve({
        data: table === "tenant_workspace_links" ? f.links : table === "tenants" ? f.tenants : table === "workspace_account_bindings" ? f.bindings : [],
        error: null,
      });
      return builder;
    },
  }),
}));
vi.mock("@/lib/client-records", () => ({
  readRecord: vi.fn(async (_store: string, tenantId: string, provider: string) => f.records.get(`${tenantId}:${provider}`) ?? null),
}));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => null }));

import { legacyGoogleConnectionsEnabled, listLegacyGoogleRows } from "@/app/api/oauth/google/legacy-connection-source";
import { registerProductConnectionSources } from "@/server/connections/sources";
import { listConnectionSources } from "@/platform/connections/sources";
import { composeWorkspaceConnections } from "@/platform/connections/read-model";
import { readProviderAccess } from "@/platform/connections/access";

const business = "cd000000-0000-4000-8000-000000000001";
const stable = "cd000000-0000-4000-8000-0000000000a1";
const TOKEN = "ya29.fictional-access-token";
const connection = (over: Record<string, unknown> = {}) => ({ provider: "google", tenantId: "mooney", status: "connected", accessToken: TOKEN, refreshToken: "1//fictional-refresh", ...over });

beforeEach(() => {
  f.tenants = [{ id: "mooney", stable_id: stable, site_name: "The Mooney Firm" }];
  f.links = [{ tenant_stable_id: stable }];
  f.records = new Map([["mooney:google", connection()]]);
  f.bindings = [];
  registerProductConnectionSources();
});
afterEach(() => vi.unstubAllEnvs());

async function compose() {
  const sources = listConnectionSources().filter(source => source.provider === "google_business_profile");
  return composeWorkspaceConnections({ workspaceId: business, sources, holders: new Map(), accessFor: provider => readProviderAccess(provider) });
}

describe("Redis-only Google accounts in Connections", () => {
  it("is off by default and shows nothing", async () => {
    expect(legacyGoogleConnectionsEnabled({})).toBe(false);
    expect((await compose()).connections).toEqual([]);
  });

  it("with the flag on and no binding, shows one row with Unknown holders that passes scope checks", async () => {
    vi.stubEnv("STRELVA_CONNECTIONS_LEGACY_GOOGLE", "1");
    const result = await compose();
    expect(result.sourceErrors).toEqual([]);
    expect(result.connections).toHaveLength(1);
    expect(result.connections[0]).toMatchObject({
      ref: `google_business_profile:legacy:${stable}`, provider: "google_business_profile", workspaceId: business,
      accountLabel: "Google Business Profile · The Mooney Firm", accountHolder: { kind: "unknown" }, accessThrough: { kind: "unknown" },
    });
  });

  it("marks a needs_reauth or expired grant stale and a disconnected one disconnected", async () => {
    f.records.set("mooney:google", connection({ status: "needs_reauth" }));
    expect((await listLegacyGoogleRows(business))[0]?.state).toBe("stale");
    f.records.set("mooney:google", connection({ expiresAt: "2020-01-01T00:00:00.000Z" }));
    expect((await listLegacyGoogleRows(business))[0]?.state).toBe("stale");
    f.records.set("mooney:google", connection({ status: "disconnected" }));
    expect((await listLegacyGoogleRows(business))[0]?.state).toBe("disconnected");
  });

  it("adds no legacy row once a binding row exists", async () => {
    vi.stubEnv("STRELVA_CONNECTIONS_LEGACY_GOOGLE", "1");
    f.bindings = [{ id: "cd000000-0000-4000-8000-0000000000b1", status: "connected", created_at: "2026-10-15T00:00:00Z" }];
    const result = await compose();
    expect(result.connections.map(row => row.ref)).toEqual(["google_business_profile:cd000000-0000-4000-8000-0000000000b1"]);
  });

  it("sends a cross-tenant payload to sourceErrors", async () => {
    vi.stubEnv("STRELVA_CONNECTIONS_LEGACY_GOOGLE", "1");
    f.records.set("mooney:google", connection({ tenantId: "someone-else" }));
    const result = await compose();
    expect(result.connections).toEqual([]);
    expect(result.sourceErrors).toEqual(["google_business_profile"]);
  });

  it("never carries a token", async () => {
    vi.stubEnv("STRELVA_CONNECTIONS_LEGACY_GOOGLE", "1");
    const json = JSON.stringify(await compose());
    expect(json).not.toContain(TOKEN);
    expect(json).not.toContain("fictional-refresh");
  });
});
