import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const cache = vi.hoisted(() => ({ mode: "absent" as "absent" | "offline" | "online", values: new Map<string, unknown>(), calls: [] as string[] }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => cache.mode === "absent" ? null : {
  get: async (key: string) => { cache.calls.push(`get:${key}`); if (cache.mode === "offline") throw new Error("redis offline"); return cache.values.get(key) ?? null; },
  set: async (key: string, value: unknown) => { cache.calls.push(`set:${key}`); if (cache.mode === "offline") throw new Error("redis offline"); cache.values.set(key, value); return "OK"; },
  del: async (key: string) => { cache.calls.push(`del:${key}`); if (cache.mode === "offline") throw new Error("redis offline"); return cache.values.delete(key) ? 1 : 0; },
} }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => null }));
import { setClientRecordDb, type ClientRecordDb } from "@/platform/client-records/mirror";
import { getGoal, setGoal, clearGoal } from "@/lib/goals";
import { getContentAutonomy, saveContentAutonomy, saveContentAutonomySetting } from "@/lib/content-autonomy";
import { getReplyVoice, saveReplyVoice } from "@/lib/reviews/reply-voice";
import { TenantSettingRefusedError, type TenantSettingsPort } from "@/platform/needs-you/tenant-settings";
const rows = new Map<string, { recordId: string; payload: Record<string, unknown>; capturedAt: string }>();
const operations: string[] = [];
let fail: string | null = null, days = 7, kept = false;
const db: ClientRecordDb = { rpc(name, args) {
  operations.push(`${name}:${String(args.p_record_id ?? "")}`);
  if (fail === name) return Promise.resolve({ data: null, error: { message: "offline" } });
  if (name === "client_record_parity_streak") return Promise.resolve({ data: { days }, error: null });
  if (name === "record_tenant_client_record") {
    if (kept) return Promise.resolve({ data: { status: "kept" }, error: null });
    const key = `${args.p_tenant_id}|${args.p_record_id}`;
    if (args.p_mode === "remove") { rows.delete(key); return Promise.resolve({ data: { status: "removed" }, error: null }); }
    rows.set(key, { recordId: String(args.p_record_id), payload: args.p_payload as Record<string, unknown>, capturedAt: String(args.p_captured_at) });
    return Promise.resolve({ data: { status: "recorded" }, error: null });
  }
  if (name === "read_tenant_client_records_page") return Promise.resolve({ data: [...rows].filter(([key]) => key.startsWith(`${args.p_tenant_id}|`)).map(([, row]) => row), error: null });
  return Promise.resolve({ data: null, error: { message: name } });
} };
const actor = { userId: "a0000000-0000-4000-8000-0000000000aa", verifiedEmail: "owner@example.test" };
function policyPort(refuse = false): TenantSettingsPort {
  const state = { route: "owner_decides", strelvaRoute: "strelva_reviews", ownerRoute: "owner_decides" } as const;
  return { read: async () => ({ workspaceId: "a0000000-0000-4000-8000-000000000001", imported: [], routes: { "copy.routine": state, "review.reply": state } }),
    write: async () => { operations.push("policy-write"); if (refuse) throw new TenantSettingRefusedError("access_denied", "denied"); return { workspaceId: "a0000000-0000-4000-8000-000000000001", state }; } };
}
beforeEach(() => {
  cache.mode = "absent"; cache.values.clear(); cache.calls.length = 0; rows.clear(); operations.length = 0; fail = null; days = 7; kept = false; setClientRecordDb(db);
  vi.stubEnv("STRELVA_CLIENT_RECORDS_READ", "tenant_settings"); vi.stubEnv("STRELVA_CLIENT_RECORDS_DUAL_WRITE", "1"); vi.stubEnv("DUAL_WRITE_PG", "1"); vi.stubEnv("STRELVA_NEEDS_YOU_RELEASE", "0");
});
afterEach(() => { setClientRecordDb(undefined); vi.unstubAllEnvs(); });
describe("qualified tenant settings use durable write authority", () => {
  it.each(["absent", "offline"] as const)("saves and reads all settings, then removes the goal with Redis %s", async mode => {
    cache.mode = mode;
    const goal = await setGoal("acme", "calls", 12);
    expect(goal).toMatchObject({ metric: "calls", target: 12 }); expect(await getGoal("acme")).toEqual(goal);
    expect(await saveContentAutonomy("acme", "auto")).toBe("auto"); expect(await getContentAutonomy("acme", { enabled: false })).toBe("auto");
    const voice = await saveReplyVoice("acme", { mode: "off", guidance: "  Short and warm.  ", templates: [{ key: "praise", example: " Thanks. " }, { key: "praise", example: "duplicate" }, { key: "unknown", example: "drop" }] });
    expect(voice).toMatchObject({ mode: "off", guidance: "Short and warm.", templates: [{ key: "praise", example: "Thanks." }] }); expect(await getReplyVoice("acme", { enabled: false })).toEqual(voice);
    await clearGoal("acme"); expect(await getGoal("acme")).toBeNull();
    expect(rows.has("acme|content_autonomy")).toBe(true); expect(rows.has("acme|reply_voice")).toBe(true);
    expect([...rows.keys()].some(key => key.startsWith("other|"))).toBe(false);
  });
  it("durable fallback is reported honestly while policy remains the effective authority", async () => {
    expect(await saveContentAutonomySetting("acme", "auto", null)).toMatchObject({ mode: "auto", storedIn: "tenant_settings" });
    const options = { enabled: true, port: policyPort() };
    expect(await saveContentAutonomySetting("acme", "auto", { actor, layer: "owner" }, options)).toMatchObject({ mode: "approve", requested: "auto", storedIn: "decision_policies" });
    const voice = await saveReplyVoice("acme", { mode: "auto", guidance: "Friendly" }, { actor, layer: "owner" }, options);
    expect(voice.mode).toBe("approve"); expect(rows.get("acme|reply_voice")?.payload.value).toMatchObject({ mode: "auto", guidance: "Friendly" });
    expect(operations.indexOf("policy-write")).toBeLessThan(operations.indexOf("record_tenant_client_record:reply_voice"));
  });
  it.each(["goal", "content_autonomy", "reply_voice"])("does not acknowledge a failed %s durable write or update Redis; clean retry succeeds", async id => {
    cache.mode = "online"; fail = "record_tenant_client_record";
    const save = () => id === "goal" ? setGoal("acme", "calls", 12) : id === "content_autonomy" ? saveContentAutonomy("acme", "auto") : saveReplyVoice("acme", { mode: "off" });
    await expect(save()).rejects.toThrow(/write_failed/); expect(rows.size).toBe(0); expect(cache.calls.filter(call => call.startsWith("set:"))).toEqual([]);
    fail = null; await save(); expect(rows.has(`acme|${id}`)).toBe(true); expect(cache.calls.some(call => call.startsWith("set:"))).toBe(true);
  });
  it("failed durable removal preserves the goal and cache until a clean retry", async () => {
    cache.mode = "online"; const goal = await setGoal("acme", "calls", 12); cache.calls.length = 0; fail = "record_tenant_client_record";
    await expect(clearGoal("acme")).rejects.toThrow(/remove_failed/); expect(await getGoal("acme")).toEqual(goal); expect(cache.calls).not.toContain("del:goal:acme");
    fail = null; await clearGoal("acme"); expect(await getGoal("acme")).toBeNull(); expect(cache.values.has("goal:acme")).toBe(false);
  });
  it.each(["goal", "content_autonomy", "reply_voice"])("a superseded %s write cannot acknowledge a new value or change the cache", async id => {
    cache.mode = "online"; kept = true;
    const save = () => id === "goal" ? setGoal("acme", "calls", 12) : id === "content_autonomy" ? saveContentAutonomy("acme", "auto") : saveReplyVoice("acme", { mode: "off" });
    await expect(save()).rejects.toThrow(/superseded/); expect(rows.size).toBe(0); expect(cache.calls.filter(call => call.startsWith("set:"))).toEqual([]);
  });
  it("a stale removal that loses to a newer durable goal refuses without deleting its cache", async () => {
    cache.mode = "online"; const goal = await setGoal("acme", "calls", 12); cache.calls.length = 0; kept = true;
    await expect(clearGoal("acme")).rejects.toThrow(/remove|superseded/); expect(await getGoal("acme")).toEqual(goal); expect(cache.calls).not.toContain("del:goal:acme");
  });
  it.each(["content_autonomy", "reply_voice"])("policy refusal precedes any %s durable write", async id => {
    const options = { enabled: true, port: policyPort(true) };
    const save = () => id === "content_autonomy" ? saveContentAutonomySetting("acme", "auto", { actor, layer: "owner" }, options) : saveReplyVoice("acme", { mode: "approve" }, { actor, layer: "owner" }, options);
    await expect(save()).rejects.toBeInstanceOf(TenantSettingRefusedError); expect(rows.size).toBe(0); expect(cache.calls.filter(call => call.startsWith("set:"))).toEqual([]);
  });
  it("qualification refusal precedes policy effects and never falls back to Redis", async () => {
    cache.mode = "online"; days = 6;
    await expect(saveContentAutonomySetting("acme", "auto", { actor, layer: "owner" }, { enabled: true, port: policyPort() })).rejects.toThrow(/not_qualified/);
    expect(operations).not.toContain("policy-write"); expect(rows.size).toBe(0); expect(cache.calls).toEqual([]);
  });
  it("a later blob failure is explicit even after policy committed; no cross-store rollback is claimed", async () => {
    fail = "record_tenant_client_record";
    await expect(saveReplyVoice("acme", { mode: "approve" }, { actor, layer: "owner" }, { enabled: true, port: policyPort() })).rejects.toThrow(/write_failed/);
    expect(operations).toContain("policy-write"); expect(rows.size).toBe(0);
  });
  it.each(["client_record_parity_streak", "read_tenant_client_records_page"])("%s read outage stays explicit after cutover", async name => {
    fail = name; cache.mode = "online";
    await expect(getGoal("acme")).rejects.toThrow(); expect(cache.calls).toEqual([]);
  });
  it("legacy Redis authority and invalid-input behavior stay unchanged", async () => {
    vi.stubEnv("STRELVA_CLIENT_RECORDS_READ", ""); cache.mode = "online";
    const goal = await setGoal("acme", "calls", 12); expect(await getGoal("acme")).toEqual(goal); await clearGoal("acme"); expect(await getGoal("acme")).toBeNull();
    expect(await saveContentAutonomySetting("acme", "auto", null)).toMatchObject({ storedIn: "redis" });
    expect((await saveReplyVoice("acme", { mode: "off" })).mode).toBe("off");
    const writes = operations.length; expect(await setGoal("acme", "calls", -1)).toBeNull(); expect(operations).toHaveLength(writes);
    cache.mode = "absent"; expect(await setGoal("acme", "calls", 12)).toBeNull();
  });
});
