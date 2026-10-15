import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), redis: vi.fn() }));
vi.mock("@/platform/agency-pay-links/index", async () => ({ ...await vi.importActual<typeof import("@/platform/agency-pay-links/index")>("@/platform/agency-pay-links/index"), readPublicAgencyPayLink: mocks.read }));
vi.mock("@/platform/infra/pay-links", async () => ({ ...await vi.importActual<typeof import("@/platform/infra/pay-links")>("@/platform/infra/pay-links"), getRedisPayLink: mocks.redis }));
import { resolvePublicPayLink } from "@/platform/agency-pay-links/public";

const row = (over: Record<string, unknown>) => ({ id: "a2830000-0000-4000-8000-000000000012", slug: "harbor-site", rail: "connected_account", clientName: "Harbor Dental", door: null, createdAt: "2026-10-15T00:00:00Z", ...over });
const legacy = { slug: "harbor-site", clientName: "Redis Client", door: "build", amountCents: 50000, createdAt: "2026-07-01" };
const on = () => { vi.stubEnv("STRELVA_AGENCY_PAY_LINKS", "1"); vi.stubEnv("STRELVA_CONNECT", "1"); vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x"); };
beforeEach(() => { vi.clearAllMocks(); mocks.redis.mockResolvedValue(null); mocks.read.mockResolvedValue(null); });
afterEach(() => vi.unstubAllEnvs());

describe("resolvePublicPayLink", () => {
  it("reads only Redis when everything is off", async () => {
    mocks.redis.mockResolvedValue(legacy);
    expect(await resolvePublicPayLink("harbor-site")).toEqual({ kind: "legacy", config: legacy });
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("hides a connected link while its switch is off", async () => {
    vi.stubEnv("STRELVA_PAY_LINK_STORE", "postgres");
    mocks.read.mockResolvedValue(row({}));
    expect(await resolvePublicPayLink("harbor-site")).toBeNull();
  });
  it("serves a connected link when the switch is on", async () => {
    on(); mocks.read.mockResolvedValue(row({}));
    expect(await resolvePublicPayLink("harbor-site")).toMatchObject({ kind: "connected" });
  });
  it("falls back to Redis when the switch is on but the link is not in Postgres", async () => {
    on(); mocks.redis.mockResolvedValue(legacy);
    expect(await resolvePublicPayLink("harbor-site")).toMatchObject({ kind: "legacy" });
  });
  it("serves backfilled legacy links from Postgres only after the store switch, and not from Redis", async () => {
    vi.stubEnv("STRELVA_PAY_LINK_STORE", "postgres");
    mocks.read.mockResolvedValue(row({ rail: "platform_legacy", door: "build", amountCents: 50000, minCents: null, maxCents: null, description: null }));
    mocks.redis.mockResolvedValue(legacy);
    expect(await resolvePublicPayLink("harbor-site")).toMatchObject({ kind: "legacy", config: { clientName: "Harbor Dental" } });
    expect(mocks.redis).not.toHaveBeenCalled();
  });
  it("rejects slugs that are not slugs", async () => {
    expect(await resolvePublicPayLink("Not A Slug!")).toBeNull();
    expect(await resolvePublicPayLink("index")).toBeNull();
  });
});
