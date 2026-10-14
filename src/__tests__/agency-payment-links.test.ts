import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { PAY_LINK_COMMAND_SCRIPT, PAY_LINK_INDEX_KEY, PAY_LINK_PREFIX, type PayLinkConfig } from "@/platform/infra/pay-links";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), list: vi.fn(), rpc: vi.fn(), redis: vi.fn(), payments: vi.fn(), availability: vi.fn(), brand: vi.fn() }));
vi.mock("@/platform/workspaces/agency-onboarding", () => ({ listMemberAgencies: mocks.list }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/platform/agency-brand/server", () => ({ resolveOwnerBrand: mocks.brand }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: mocks.redis }));
vi.mock("@/platform/infra/revenue", () => ({ listBuildPayments: mocks.payments }));
vi.mock("@/platform/connect/checkout-availability", () => ({ readCheckoutAvailability: mocks.availability }));
vi.mock("@/platform/workspaces/http", async () => ({ ...await vi.importActual<typeof import("@/platform/workspaces/http")>("@/platform/workspaces/http"), workspaceHttpActor: mocks.actor }));
import { GET, POST } from "@/app/api/agency/payment-links/route";

const agency = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const client = "33333333-3333-4333-8333-333333333333";
const userId = "44444444-4444-4444-8444-444444444444";
const key = "55555555-5555-4555-8555-555555555555";
const actor = { userId, verifiedEmail: "owner@example.test" };
const member = { id: agency, name: "Strelva Agency", role: "owner" };
const oldLink: PayLinkConfig = { slug: "old-link", clientName: "Old Client", door: "build", amountCents: 50000, leadSlug: "old-link", createdAt: "2026-07-01T00:00:00Z", createdBy: "old@example.test" };

// Redis transport contract double. It models atomic command replies, not a
// native Lua execution proof. Assertions below also pin the script/keys/args.
function store() {
  const records = new Map<string, PayLinkConfig>();
  const receipts = new Map<string, { fingerprint: string; config: PayLinkConfig }>();
  const slugs = new Set<string>();
  const redis = {
    get: vi.fn(async (key: string) => records.get(key) ?? null),
    smembers: vi.fn(async () => [...slugs]),
    mget: vi.fn(async (...keys: string[]) => keys.map(key => records.get(key) ?? null)),
    srem: vi.fn(),
    eval: vi.fn(async (_script: string, keys: string[], args: (string | number)[]) => {
      const [fingerprint, action, raw, , owner, revokedAt, revokedBy] = args.map(String);
      const prior = receipts.get(keys[0]!);
      if (prior) return { status: prior.fingerprint === fingerprint ? "ok" : "conflict", config: prior.config };
      let config = records.get(keys[1]!);
      if (action === "create") {
        if (config) return { status: "conflict" };
        config = JSON.parse(raw!) as PayLinkConfig;
        records.set(keys[1]!, config); slugs.add(config.slug);
      } else {
        if (!config) return { status: "missing" };
        if (config.agencyWorkspaceId && config.agencyWorkspaceId !== owner) return { status: "denied" };
        if (!config.revokedAt) { config = { ...config, revokedAt, revokedBy }; records.set(keys[1]!, config); }
      }
      receipts.set(keys[0]!, { fingerprint: fingerprint!, config: config! });
      return { status: "ok", config };
    }),
  };
  const seed = (config: PayLinkConfig) => { records.set(`${PAY_LINK_PREFIX}${config.slug}`, config); slugs.add(config.slug); };
  return { redis, records, seed };
}
let memory: ReturnType<typeof store>;
const create = (extras: Record<string, unknown> = {}) => ({ action: "create", agencyWorkspaceId: agency, idempotencyKey: key, clientName: "Acme Coffee", description: "Agreed website build", amountCents: 50000, ...extras });
const post = (body: unknown, headers: Record<string, string> = {}) => POST(new Request("https://app.example.test/api/agency/payment-links", { method: "POST", headers: { origin: "https://app.example.test", "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));
const read = (id = agency) => GET(new Request(`https://app.example.test/api/agency/payment-links?agencyWorkspaceId=${id}`));
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1"); vi.stubEnv("STRELVA_AGENCY_WORKSPACE_ID", agency);
  mocks.actor.mockResolvedValue(actor); mocks.list.mockResolvedValue([member]); mocks.rpc.mockResolvedValue({ data: [{ customerWorkspaceId: client, name: "Client Coffee" }], error: null });
  mocks.payments.mockResolvedValue([]); mocks.availability.mockResolvedValue({ status: "coming_soon" });
  mocks.brand.mockResolvedValue({ agencyId: agency, name: "Strelva Agency" });
  memory = store(); mocks.redis.mockReturnValue(memory.redis);
});
afterEach(() => vi.unstubAllEnvs());

describe("neutral agency payment links", () => {
  it.each([agency, other])("refuses new payment links for agency %s before any storage write", async id => {
    mocks.list.mockResolvedValue([{ ...member, id }]);
    const response = await post(create({ agencyWorkspaceId: id }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("Stripe Connect") });
    expect(memory.redis.eval).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("preserves scoped historical links, paid status and idempotent expiration", async () => {
    memory.seed(oldLink); memory.seed({ ...oldLink, slug: "foreign", agencyWorkspaceId: other });
    mocks.payments.mockResolvedValue([{ paySlug: oldLink.slug, amountCents: 50000, createdAt: "2026-10-12" }, { paySlug: "foreign", amountCents: 100000, createdAt: "2026-10-12" }]);
    const listed = await (await read()).json();
    expect(listed.payLinks.map((link: PayLinkConfig) => link.slug)).toEqual([oldLink.slug]);
    expect(Object.keys(listed.paidPayments)).toEqual([oldLink.slug]);
    const revoke = { action: "revoke", agencyWorkspaceId: agency, slug: oldLink.slug, idempotencyKey: key };
    const first = await (await post(revoke)).json(); const second = await (await post(revoke)).json();
    expect(second).toEqual(first); expect(first.payLink.revokedBy).toBe(userId);
    expect(first.payLink.revokedAt).toBeTruthy(); expect(first.payLink.agencyWorkspaceId).toBeUndefined();
    expect((await (await read()).json()).payLinks).toHaveLength(1);
    expect(memory.redis.eval).toHaveBeenCalledWith(PAY_LINK_COMMAND_SCRIPT, [expect.stringMatching(/^reb:paylink:command:/), `${PAY_LINK_PREFIX}${oldLink.slug}`, PAY_LINK_INDEX_KEY], expect.any(Array));
    expect(memory.redis.srem).not.toHaveBeenCalled();
  });
  it("keeps other agencies away from the legacy merchant's records", async () => {
    memory.seed(oldLink); mocks.list.mockResolvedValue([{ ...member, id: other, name: "Other Studio" }]);
    const value = await (await read(other)).json(); expect(value).toMatchObject({ legacyMerchant: false, payLinks: [], paidPayments: {} });
    expect(mocks.redis).not.toHaveBeenCalled();
    expect((await post({ action: "revoke", agencyWorkspaceId: other, idempotencyKey: key, slug: oldLink.slug })).status).toBe(403);
    expect(memory.redis.eval).not.toHaveBeenCalled();
  });
  it("refuses platform staff without membership, members, changed actors and cross-site writes", async () => {
    mocks.actor.mockResolvedValue({ ...actor, isSuperAdmin: true }); mocks.list.mockResolvedValue([]);
    expect((await post(create())).status).toBe(403); expect((await read()).status).toBe(403);
    mocks.list.mockResolvedValue([{ ...member, role: "member" }]); expect((await post(create())).status).toBe(403);
    mocks.list.mockResolvedValue([member]); expect((await post(create({ expectedActorId: other }))).status).toBe(403);
    expect((await post(create(), { origin: "https://attacker.example.test" })).status).toBe(403);
    expect(memory.redis.eval).not.toHaveBeenCalled();
  });
  it("rechecks authority immediately before historical expiration", async () => {
    memory.seed(oldLink); mocks.list.mockResolvedValueOnce([member]).mockResolvedValue([{ ...member, role: "member" }]);
    expect((await post({ action: "revoke", agencyWorkspaceId: agency, slug: oldLink.slug, idempotencyKey: key })).status).toBe(403);
    expect(memory.redis.eval).not.toHaveBeenCalled();
  });
  it("fails closed for foreign links, missing merchant configuration, identity, storage and release", async () => {
    memory.seed({ ...oldLink, agencyWorkspaceId: other });
    const revoke = { action: "revoke", agencyWorkspaceId: agency, slug: oldLink.slug, idempotencyKey: key };
    expect((await post(revoke)).status).toBe(403);
    vi.stubEnv("STRELVA_AGENCY_WORKSPACE_ID", ""); expect((await post(revoke)).status).toBe(403);
    expect((await (await read()).json()).legacyMerchant).toBe(false);
    vi.stubEnv("STRELVA_AGENCY_WORKSPACE_ID", agency); mocks.brand.mockResolvedValue({ agencyId: null });
    expect((await read()).status).toBe(503);
    mocks.redis.mockReturnValue(null); expect((await read()).status).toBe(503);
    mocks.actor.mockResolvedValue(null); expect((await post(revoke)).status).toBe(401);
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "0"); expect((await read()).status).toBe(503); expect((await post(revoke)).status).toBe(503);
    expect(memory.redis.eval).not.toHaveBeenCalled();
  });
  it("reports failed payment reads separately from unpaid and rejects forged command ownership", async () => {
    memory.seed(oldLink); mocks.payments.mockRejectedValue(new Error("unavailable"));
    expect((await (await read()).json()).paymentStatusAvailable).toBe(false);
    expect((await post(create({ tenantId: "foreign" }))).status).toBe(400);
    expect((await post(create({ createdBy: other }))).status).toBe(400);
    expect(memory.redis.eval).not.toHaveBeenCalled();
  });
});
