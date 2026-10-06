import { beforeEach, describe, expect, it, vi } from "vitest";
import { KIND_RULES, routeRank, stricterOf, type LadderRoute } from "@/platform/needs-you/contracts";
import { seedPolicyFromTenant } from "@/platform/needs-you/parity";
import {
  TenantSettingRefusedError,
  contentAutonomyFromRoute,
  planContentAutonomy,
  planReplyMode,
  planTenantSeed,
  readTenantPolicyRoute,
  replyModeFromRoute,
  writeTenantPolicySetting,
  type TenantPolicyKind,
  type TenantRoutes,
  type TenantSettingWrite,
  type TenantSettingsPort,
} from "@/platform/needs-you/tenant-settings";

const redis = new Map<string, unknown>();
vi.mock("@/lib/redis", () => ({
  getRedis: () => ({
    get: async (key: string) => redis.get(key) ?? null,
    set: async (key: string, value: unknown) => { redis.set(key, value); return "OK"; },
  }),
}));

const { getContentAutonomy, saveContentAutonomySetting } = await import("@/lib/content-autonomy");
const { getReplyVoice, saveReplyVoice } = await import("@/lib/reviews/reply-voice");

const WORKSPACE = "a0000000-0000-4000-8000-000000000001";
const OWNER = { userId: "a0000000-0000-4000-8000-0000000000aa", verifiedEmail: "owner@example.test" };

/** decision_policies for one linked tenant, with the SQL rules of set_tenant_decision_route. */
function fakePort(options: { linked?: boolean; failRead?: boolean; failWrite?: boolean } = {}) {
  const rows = new Map<string, LadderRoute>();
  const imported = new Map<TenantPolicyKind, string>();
  const writes: TenantSettingWrite[] = [];
  const state = (kind: TenantPolicyKind) => {
    const strelvaRoute = rows.get(`strelva:${kind}`) ?? KIND_RULES[kind].default;
    const ownerRoute = rows.get(`owner:${kind}`) ?? null;
    const base = stricterOf(strelvaRoute, KIND_RULES[kind].floor);
    return { route: ownerRoute ? stricterOf(base, ownerRoute) : base, strelvaRoute, ownerRoute };
  };
  const port: TenantSettingsPort = {
    async read(): Promise<TenantRoutes | null> {
      if (options.failRead) throw new Error("postgres down");
      if (options.linked === false) return null;
      return { workspaceId: WORKSPACE, imported: [...imported.keys()], routes: { "copy.routine": state("copy.routine"), "review.reply": state("review.reply") } };
    },
    async write(input) {
      if (options.failWrite) throw new Error("postgres down");
      if (options.linked === false) throw new TenantSettingRefusedError("not_linked", "not linked");
      writes.push(input);
      if (input.route && routeRank(input.route) < routeRank(KIND_RULES[input.kind].floor)) throw new TenantSettingRefusedError("below_floor", "below floor");
      if (input.layer === "owner" && input.route && routeRank(input.route) < routeRank(state(input.kind).strelvaRoute)) {
        throw new TenantSettingRefusedError("looser_than_default", "looser");
      }
      if (input.route) rows.set(`${input.layer}:${input.kind}`, input.route);
      else rows.delete(`${input.layer}:${input.kind}`);
      if (!imported.has(input.kind)) imported.set(input.kind, input.todayValue);
      return { workspaceId: WORKSPACE, state: state(input.kind) };
    },
  };
  return { port, rows, imported, writes };
}

beforeEach(() => redis.clear());

describe("mapping", () => {
  it("reads routes as today's modes", () => {
    expect(contentAutonomyFromRoute("handle")).toBe("auto");
    expect(contentAutonomyFromRoute("strelva_reviews")).toBe("approve");
    expect(replyModeFromRoute("handle_after_notice")).toBe("auto");
    expect(replyModeFromRoute("strelva_reviews")).toBe("approve");
    expect(replyModeFromRoute("owner_decides")).toBe("approve");
  });

  it("writes reply approve as the owner row the parity seed writes", () => {
    const seeded = seedPolicyFromTenant({ tenantId: "t", contentAutonomy: "approve", replyMode: "approve", autoApproveThreshold: 0 }).policies;
    expect(seeded).toEqual([{ layer: "owner", systemId: null, kind: "review.reply", route: planReplyMode("approve", "owner").route }]);
    expect(planReplyMode("auto", "owner").route).toBeNull();
  });

  it("never migrates content autonomy auto silently", () => {
    const plan = planContentAutonomy("auto", "owner", { route: "strelva_reviews", strelvaRoute: "strelva_reviews", ownerRoute: null });
    expect(plan.route).toBeNull();
    expect(plan.notMigrated).toMatch(/recorded/);
    // When Strelva already lets routine copy through, auto takes effect.
    expect(planContentAutonomy("auto", "owner", { route: "handle", strelvaRoute: "handle", ownerRoute: null }).notMigrated).toBeNull();
    // Ask me first under Strelva's handle is the owner's stricter row; otherwise default.
    expect(planContentAutonomy("approve", "owner", { route: "handle", strelvaRoute: "handle", ownerRoute: null }).route).toBe("strelva_reviews");
    expect(planContentAutonomy("approve", "owner", { route: "strelva_reviews", strelvaRoute: "strelva_reviews", ownerRoute: null }).route).toBeNull();
    expect(planContentAutonomy("approve", "owner", { route: "owner_decides", strelvaRoute: "strelva_reviews", ownerRoute: "owner_decides" }).route).toBe("owner_decides");
    expect(planContentAutonomy("auto", "strelva", { route: "strelva_reviews", strelvaRoute: "strelva_reviews", ownerRoute: null }).route).toBe("handle");
  });
});

describe("content autonomy with decision_policies", () => {
  it("answers from Redis when the release is off, whatever Postgres holds", async () => {
    const fake = fakePort();
    redis.set("reb:content-autonomy:gldf", "auto");
    await fake.port.write({ tenantId: "gldf", actor: OWNER, layer: "owner", kind: "copy.routine", route: "owner_decides", todayValue: "auto", notMigrated: null, via: "owner_save" });
    expect(await getContentAutonomy("gldf", { enabled: false, port: fake.port })).toBe("auto");
  });

  it("answers from Redis for an unlinked tenant, before the setting moved, and when Postgres fails", async () => {
    redis.set("reb:content-autonomy:gldf", "auto");
    expect(await getContentAutonomy("gldf", { enabled: true, port: fakePort({ linked: false }).port })).toBe("auto");
    expect(await getContentAutonomy("gldf", { enabled: true, port: fakePort().port })).toBe("auto");
    expect(await getContentAutonomy("gldf", { enabled: true, port: fakePort({ failRead: true }).port })).toBe("auto");
    const hanging: TenantSettingsPort = { read: () => new Promise(() => {}), write: () => new Promise(() => {}) };
    expect(await getContentAutonomy("gldf", { enabled: true, port: hanging, timeoutMs: 5 })).toBe("auto");
  });

  it("reads Postgres for a linked tenant once the setting moved", async () => {
    const fake = fakePort();
    redis.set("reb:content-autonomy:gldf", "auto");
    const saved = await saveContentAutonomySetting("gldf", "auto", { actor: OWNER, layer: "owner" }, { enabled: true, port: fake.port });
    // The owner can't loosen past Strelva's default: recorded, not in force, and said so.
    expect(saved).toMatchObject({ mode: "approve", requested: "auto", storedIn: "decision_policies" });
    expect(saved.note).toMatch(/recorded/);
    expect(fake.imported.get("copy.routine")).toBe("auto");
    expect(fake.writes[0]).toMatchObject({ layer: "owner", route: null, via: "owner_save", todayValue: "auto" });
    // The frozen Redis key still holds the owner's words.
    expect(redis.get("reb:content-autonomy:gldf")).toBe("auto");
    expect(await getContentAutonomy("gldf", { enabled: true, port: fake.port })).toBe("approve");
    // An operator grants it as Strelva's setting; then it is in force.
    const granted = await saveContentAutonomySetting("gldf", "auto", { actor: OWNER, layer: "strelva" }, { enabled: true, port: fake.port });
    expect(granted).toMatchObject({ mode: "auto", note: null });
    expect(await getContentAutonomy("gldf", { enabled: true, port: fake.port })).toBe("auto");
  });

  it("keeps the Redis-only save when nobody verified is saving or Postgres is down", async () => {
    expect(await saveContentAutonomySetting("gldf", "auto", null, { enabled: true, port: fakePort().port })).toMatchObject({ mode: "auto", storedIn: "redis" });
    expect(await saveContentAutonomySetting("gldf", "approve", { actor: OWNER, layer: "owner" }, { enabled: true, port: fakePort({ failWrite: true }).port }))
      .toMatchObject({ mode: "approve", storedIn: "redis" });
    expect(redis.get("reb:content-autonomy:gldf")).toBe("approve");
  });
});

describe("reply mode with decision_policies", () => {
  it("moves the mode and keeps voice and templates in Redis", async () => {
    const fake = fakePort();
    redis.set("reb:reply-voice:gldf", { mode: "auto", guidance: "Warm and short.", templates: [], updatedAt: null });
    const voice = await saveReplyVoice("gldf", { mode: "approve", guidance: "Warm and short." }, { actor: OWNER, layer: "owner" }, { enabled: true, port: fake.port });
    expect(voice.mode).toBe("approve");
    expect(fake.rows.get("owner:review.reply")).toBe("owner_decides");
    expect(fake.imported.get("review.reply")).toBe("auto");
    expect((redis.get("reb:reply-voice:gldf") as { guidance: string }).guidance).toBe("Warm and short.");
    // Postgres is the authority now: a stale Redis mode doesn't win.
    redis.set("reb:reply-voice:gldf", { mode: "auto", guidance: "Warm and short.", templates: [], updatedAt: null });
    expect((await getReplyVoice("gldf", { enabled: true, port: fake.port })).mode).toBe("approve");
    // Back to auto clears the owner's row.
    expect((await saveReplyVoice("gldf", { mode: "auto" }, { actor: OWNER, layer: "owner" }, { enabled: true, port: fake.port })).mode).toBe("auto");
    expect(fake.rows.has("owner:review.reply")).toBe(false);
  });

  it("leaves off in Redis and never writes it as a route", async () => {
    const fake = fakePort();
    const voice = await saveReplyVoice("gldf", { mode: "off" }, { actor: OWNER, layer: "owner" }, { enabled: true, port: fake.port });
    expect(voice.mode).toBe("off");
    expect(fake.writes).toHaveLength(0);
    expect((await getReplyVoice("gldf", { enabled: true, port: fake.port })).mode).toBe("off");
  });

  it("refuses below the floor and saves nothing", async () => {
    const fake = fakePort();
    const below: TenantSettingsPort = { ...fake.port, write: (input) => fake.port.write({ ...input, route: "handle" }) };
    await expect(saveReplyVoice("gldf", { mode: "approve" }, { actor: OWNER, layer: "strelva" }, { enabled: true, port: below })).rejects.toBeInstanceOf(TenantSettingRefusedError);
    expect(redis.has("reb:reply-voice:gldf")).toBe(false);
  });

  it("falls back to Redis when Postgres fails", async () => {
    redis.set("reb:reply-voice:gldf", { mode: "approve", guidance: "", templates: [], updatedAt: null });
    expect((await getReplyVoice("gldf", { enabled: true, port: fakePort({ failRead: true }).port })).mode).toBe("approve");
  });
});

describe("seed plan", () => {
  const fresh = (): TenantRoutes => ({
    workspaceId: WORKSPACE, imported: [],
    routes: {
      "copy.routine": { route: "strelva_reviews", strelvaRoute: "strelva_reviews", ownerRoute: null },
      "review.reply": { route: "handle_after_notice", strelvaRoute: "handle_after_notice", ownerRoute: null },
    },
  });

  it("matches the parity seed and lists what it doesn't carry over", () => {
    const steps = planTenantSeed({ contentAutonomy: "auto", replyMode: "approve" }, fresh());
    expect(steps).toEqual([
      { kind: "copy.routine", route: null, todayValue: "auto", notMigrated: expect.stringMatching(/recorded/) },
      { kind: "review.reply", route: "owner_decides", todayValue: "approve", notMigrated: null },
    ]);
    const seeded = seedPolicyFromTenant({ tenantId: "t", contentAutonomy: "auto", replyMode: "approve", autoApproveThreshold: 0 });
    expect(seeded.notMigrated).toHaveLength(1);
    expect(seeded.policies.map(row => [row.kind, row.route])).toEqual(steps.filter(step => step.route).map(step => [step.kind, step.route]));
  });

  it("skips kinds already moved and keeps off out of the routes", () => {
    expect(planTenantSeed({ contentAutonomy: "approve", replyMode: "off" }, { ...fresh(), imported: ["copy.routine"] }))
      .toEqual([{ kind: "review.reply", route: null, todayValue: "off", notMigrated: null }]);
    expect(planTenantSeed({ contentAutonomy: "approve", replyMode: "auto" }, { ...fresh(), imported: ["copy.routine", "review.reply"] })).toEqual([]);
  });
});

describe("read and write guards", () => {
  it("does not touch Postgres when the release is off", async () => {
    const read = vi.fn();
    const port = { read, write: vi.fn() } as unknown as TenantSettingsPort;
    expect(await readTenantPolicyRoute("gldf", "copy.routine", { enabled: false, port })).toBeNull();
    expect(await writeTenantPolicySetting({ tenantId: "gldf", actor: OWNER, layer: "owner", kind: "copy.routine", todayValue: "approve", via: "owner_save", plan: () => ({ route: null, notMigrated: null }) }, { enabled: false, port }))
      .toEqual({ stored: "redis" });
    expect(read).not.toHaveBeenCalled();
  });
});
