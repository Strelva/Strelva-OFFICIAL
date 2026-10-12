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

describe("ordinary agency legacy merchant payment links", () => {
  it("creates, lists its own and old records with scoped paid status, then expires without losing ownership", async () => {
    memory.seed(oldLink); memory.seed({ ...oldLink, slug: "foreign", agencyWorkspaceId: other });
    const response = await post(create({ businessWorkspaceId: client })); expect(response.status).toBe(200);
    const { payLink } = await response.json();
    expect(payLink).toMatchObject({ agencyWorkspaceId: agency, agencyDisplayName: "Strelva Agency", createdBy: userId, businessWorkspaceId: client, clientName: "Client Coffee", leadSlug: `business-${client}` });
    expect(payLink.createdAt).toBeTruthy(); expect(payLink.tenantId).toBeUndefined();
    expect(mocks.rpc).toHaveBeenCalledWith("read_agency_provider_seats", { p_user_id: userId, p_verified_email: actor.verifiedEmail, p_agency_workspace_id: agency });
    mocks.payments.mockResolvedValue([{ paySlug: payLink.slug, amountCents: 50000, createdAt: "2026-10-12" }, { paySlug: "foreign", amountCents: 100000, createdAt: "2026-10-12" }]);
    const listed = await (await read()).json();
    expect(listed.payLinks.map((link: PayLinkConfig) => link.slug)).toEqual([payLink.slug, "old-link"]);
    expect(Object.keys(listed.paidPayments)).toEqual([payLink.slug]);
    const revoke = { action: "revoke", agencyWorkspaceId: agency, slug: payLink.slug, idempotencyKey: other };
    const first = await (await post(revoke)).json(); const second = await (await post(revoke)).json();
    expect(second).toEqual(first); expect(first.payLink).toMatchObject({ revokedBy: userId, agencyWorkspaceId: agency }); expect(first.payLink.revokedAt).toBeTruthy();
    expect((await (await read()).json()).payLinks).toHaveLength(2);
    expect(memory.redis.eval).toHaveBeenCalledWith(PAY_LINK_COMMAND_SCRIPT, [expect.stringMatching(/^reb:paylink:command:/), `${PAY_LINK_PREFIX}${payLink.slug}`, PAY_LINK_INDEX_KEY], expect.any(Array));
    expect(memory.redis.srem).not.toHaveBeenCalled();
  });
  it("supports ordinary agency admins and named prospects without a client seat", async () => {
    mocks.list.mockResolvedValue([{ ...member, role: "admin" }]);
    const result = await post(create()); expect(result.status).toBe(200); expect(mocks.rpc).not.toHaveBeenCalled();
    expect((await result.json()).payLink.clientName).toBe("Acme Coffee");
  });
  it("shows another agency's Connect state and refuses legacy creation/revocation", async () => {
    mocks.list.mockResolvedValue([{ ...member, id: other, name: "Other Studio" }]); mocks.availability.mockResolvedValue({ status: "setup_required" });
    const value = await (await read(other)).json(); expect(value).toMatchObject({ legacyMerchant: false, checkoutAvailability: { status: "setup_required" }, payLinks: [] });
    expect(mocks.redis).not.toHaveBeenCalled();
    expect((await post(create({ agencyWorkspaceId: other }))).status).toBe(403);
    expect((await post({ action: "revoke", agencyWorkspaceId: other, idempotencyKey: key, slug: "old-link" })).status).toBe(403);
    expect(memory.redis.eval).not.toHaveBeenCalled();
  });
  it("refuses an operator with no ordinary agency membership and ordinary members", async () => {
    mocks.actor.mockResolvedValue({ ...actor, type: "super_admin", isSuperAdmin: true });
    mocks.list.mockResolvedValue([]); expect((await post(create())).status).toBe(403); expect((await read()).status).toBe(403);
    mocks.list.mockResolvedValue([{ ...member, role: "member" }]); expect((await post(create())).status).toBe(403);
    expect(memory.redis.eval).not.toHaveBeenCalled();
  });
  it("rechecks owner/admin authority after the client read and before the Redis write", async () => {
    mocks.list.mockResolvedValueOnce([member]).mockResolvedValue([{ ...member, role: "member" }]);
    expect((await post(create({ businessWorkspaceId: client }))).status).toBe(403);
    expect(memory.redis.eval).not.toHaveBeenCalled();
  });
  it("captures validated agency identity instead of the raw workspace label and holds missing identity", async () => {
    mocks.list.mockResolvedValue([{ ...member, name: "Strelva" }]);
    expect((await (await post(create())).json()).payLink.agencyDisplayName).toBe("Strelva Agency");
    mocks.brand.mockResolvedValue({ agencyId: null, name: "Agency identity unavailable" });
    expect((await post(create({ idempotencyKey: other }))).status).toBe(503); expect(memory.records.size).toBe(1);
  });
  it("requires confirmed email and defaults closed when the merchant config or release flag is absent", async () => {
    mocks.actor.mockResolvedValue(null); expect((await post(create())).status).toBe(401);
    mocks.actor.mockResolvedValue(actor); vi.stubEnv("STRELVA_AGENCY_WORKSPACE_ID", "");
    expect((await post(create())).status).toBe(403); expect((await (await read()).json()).legacyMerchant).toBe(false);
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "0"); expect((await read()).status).toBe(503); expect((await post(create())).status).toBe(503);
    expect(memory.redis.eval).not.toHaveBeenCalled();
  });
  it("rejects client selection outside this agency's active seats and forged ownership/tenant input", async () => {
    expect((await post(create({ businessWorkspaceId: other }))).status).toBe(403);
    expect((await post(create({ tenantId: "foreign" }))).status).toBe(400);
    expect((await post(create({ createdBy: other }))).status).toBe(400);
    memory.seed({ ...oldLink, agencyWorkspaceId: other });
    expect((await post({ action: "revoke", agencyWorkspaceId: agency, idempotencyKey: key, slug: oldLink.slug })).status).toBe(403);
    expect(memory.redis.eval).not.toHaveBeenCalled();
  });
  it.each([{ amountCents: 4999 }, { amountCents: 1000001 }, { amountCents: 7501 }, { amountCents: 50000.5 },
    { amountCents: undefined, minCents: 100000, maxCents: 50000 }, { amountCents: undefined, minCents: 5000 },
    { minCents: 5000, maxCents: 10000 }, { slug: "bad_slug" }, { slug: "rohlax" }, { slug: "index" }])("rejects guardrail violation %j", async fields => {
    expect((await post(create(fields))).status).toBe(400); expect(memory.redis.eval).not.toHaveBeenCalled();
  });
  it("accepts a stepped range at the guardrail endpoints", async () => {
    expect((await post(create({ amountCents: undefined, minCents: 5000, maxCents: 1000000 }))).status).toBe(200);
  });
  it("replays create after a lost readback and rejects a changed body or competing slug", async () => {
    memory.redis.get.mockRejectedValueOnce(new Error("lost response"));
    expect((await post(create({ slug: "coffee" }))).status).toBe(503);
    const first = await (await post(create({ slug: "coffee" }))).json();
    const second = await (await post(create({ slug: "coffee" }))).json(); expect(second).toEqual(first); expect(memory.records.size).toBe(1);
    expect((await post(create({ slug: "different" }))).status).toBe(409);
    expect((await post(create({ slug: "coffee", amountCents: 100000 }))).status).toBe(409);
    expect((await post(create({ slug: "coffee", idempotencyKey: other }))).status).toBe(409); expect(memory.records.size).toBe(1);
  });
  it("retains the first client name and invoice after an identical retry across a client rename", async () => {
    const first = await (await post(create({ businessWorkspaceId: client }))).json();
    mocks.rpc.mockResolvedValue({ data: [{ customerWorkspaceId: client, name: "Renamed Coffee" }], error: null });
    const second = await (await post(create({ businessWorkspaceId: client }))).json();
    expect(second).toEqual(first); expect(memory.records.size).toBe(1);
  });
  it("does not revive an expired link when its create command is replayed", async () => {
    const config = (await (await post(create())).json()).payLink;
    await post({ action: "revoke", agencyWorkspaceId: agency, idempotencyKey: other, slug: config.slug });
    expect((await (await post(create())).json()).payLink.revokedAt).toBeTruthy();
  });
  it("reports failed payment reads and missing storage honestly", async () => {
    memory.seed(oldLink); mocks.payments.mockRejectedValue(new Error("unavailable"));
    expect((await (await read()).json()).paymentStatusAvailable).toBe(false);
    mocks.redis.mockReturnValue(null); expect((await read()).status).toBe(503); expect((await post(create())).status).toBe(503);
  });
  it("binds browser retries to the original signed-in actor without granting actor authority", async () => {
    expect((await post(create({ expectedActorId: other }))).status).toBe(403); expect(memory.redis.eval).not.toHaveBeenCalled();
    expect((await post(create({ expectedActorId: userId }))).status).toBe(200);
  });
  it("refuses cross-site writes before reading authority or storage", async () => {
    expect((await post(create(), { origin: "https://attacker.example.test" })).status).toBe(403);
    expect(mocks.actor).not.toHaveBeenCalled(); expect(memory.redis.eval).not.toHaveBeenCalled();
  });
});
