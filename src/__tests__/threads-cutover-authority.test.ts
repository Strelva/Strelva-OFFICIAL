import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const storage = vi.hoisted(() => ({ redis: null as unknown }));
const files = vi.hoisted(() => ({ readFile: vi.fn(), writeFile: vi.fn() }));
vi.mock("fs", () => ({ promises: files }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => storage.redis }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => null }));
import { setClientRecordDb, type ClientRecordDb } from "@/platform/client-records/mirror";
import { createThread, getThread, listThreads, updateThread, deleteThread } from "@/lib/threads";
import type { Thread } from "@/lib/conversation-types";
const rows = new Map<string, { recordId: string; payload: Record<string, unknown>; capturedAt: string }>();
const devFiles = new Map<string, string>();
let fail: string | null = null;
let days = 7;
let retained = false;
const db: ClientRecordDb = { rpc(name, args) {
  if (name === fail) return Promise.resolve({ data: null, error: { message: "offline" } });
  if (name === "client_record_parity_streak") return Promise.resolve({ data: { days }, error: null });
  if (name === "read_tenant_client_records_page") return Promise.resolve({ data: [...rows.values()], error: null });
  if (name === "record_tenant_client_record") {
    if (retained) return Promise.resolve({ data: { status: "kept" }, error: null });
    if (args.p_mode === "remove") {
      rows.delete(String(args.p_record_id));
      return Promise.resolve({ data: { status: "removed" }, error: null });
    }
    rows.set(String(args.p_record_id), { recordId: String(args.p_record_id), payload: args.p_payload as Record<string, unknown>, capturedAt: String(args.p_captured_at) });
    return Promise.resolve({ data: { status: "recorded" }, error: null });
  }
  return Promise.resolve({ data: null, error: { message: "unexpected_rpc" } });
} };
function seed(): Thread {
  const thread: Thread = { id: "retained-thread", title: "Durable conversation", messages: [], createdAt: "2026-10-08T00:00:00Z", updatedAt: "2026-10-08T00:00:00Z" };
  rows.set(thread.id, { recordId: thread.id, payload: { ...thread }, capturedAt: thread.updatedAt });
  return thread;
}
beforeEach(() => {
  storage.redis = null;
  rows.clear(); devFiles.clear(); fail = null; days = 7; retained = false;
  files.readFile.mockReset().mockImplementation(async (path: string) => {
    if (!devFiles.has(path)) throw new Error("ENOENT");
    return devFiles.get(path);
  });
  files.writeFile.mockReset().mockImplementation(async (path: string, body: string) => { devFiles.set(path, body); });
  setClientRecordDb(db);
  vi.stubEnv("STRELVA_CLIENT_RECORDS_DUAL_WRITE", "1");
  vi.stubEnv("DUAL_WRITE_PG", "1");
  vi.stubEnv("STRELVA_CLIENT_RECORDS_READ", "threads");
});
afterEach(() => { setClientRecordDb(undefined); vi.unstubAllEnvs(); });

describe("qualified thread write authority", () => {
  it("creates a conversation that subsequent durable reads retain with Redis absent", async () => {
    const thread = await createThread("acme", "Keep this conversation");
    expect(await getThread("acme", thread.id)).toEqual(thread);
    expect(await listThreads("acme")).toEqual([thread]);
    expect(files.writeFile).not.toHaveBeenCalled();
  });
  it("updates the durable conversation with Redis absent", async () => {
    const original = seed();
    const updated = await updateThread("acme", original.id, { title: "Reviewed conversation", messages: [] });
    expect(updated?.title).toBe("Reviewed conversation");
    expect(await getThread("acme", original.id)).toEqual(updated);
    expect(files.writeFile).not.toHaveBeenCalled();
  });
  it("deletes from the same durable authority that serves subsequent reads", async () => {
    const original = seed();
    await deleteThread("acme", original.id);
    expect(await getThread("acme", original.id)).toBeNull();
    expect(await listThreads("acme")).toEqual([]);
    expect(files.writeFile).not.toHaveBeenCalled();
  });
  it.each(["create", "update", "delete"])("does not acknowledge %s when the selected durable write is unavailable", async operation => {
    const original = seed(); fail = "record_tenant_client_record";
    const action = operation === "create" ? createThread("acme", "Unwritten")
      : operation === "update" ? updateThread("acme", original.id, { title: "Unwritten" }) : deleteThread("acme", original.id);
    await expect(action).rejects.toThrow(/client_records_(write|remove)_failed/);
    expect(await getThread("acme", original.id)).toEqual(original);
    expect(files.writeFile).not.toHaveBeenCalled();
  });
  it.each(["create", "update", "delete"])("does not silently perform %s before the requested cutover qualifies", async operation => {
    const original = seed(); days = 6;
    const action = operation === "create" ? createThread("acme", "Unqualified")
      : operation === "update" ? updateThread("acme", original.id, { title: "Unqualified" }) : deleteThread("acme", original.id);
    await expect(action).rejects.toThrow("client_records_cutover_not_qualified");
    expect(rows.get(original.id)?.payload).toEqual(original);
    expect(files.writeFile).not.toHaveBeenCalled();
  });
  it("does not report an update or removal that the durable timestamp guard kept", async () => {
    const original = seed(); retained = true;
    await expect(updateThread("acme", original.id, { title: "Superseded" })).rejects.toThrow(/kept/);
    await expect(deleteThread("acme", original.id)).rejects.toThrow(/kept/);
    expect(await getThread("acme", original.id)).toEqual(original);
    expect(files.writeFile).not.toHaveBeenCalled();
  });
  it("keeps frozen Redis record, index and deletion caches after durable acceptance", async () => {
    const redis = { set: vi.fn(async () => "OK"), zadd: vi.fn(async () => 1), zremrangebyrank: vi.fn(async () => 0), del: vi.fn(async () => 1), zrem: vi.fn(async () => 1) };
    storage.redis = redis;
    const thread = await createThread("acme", "Cached conversation");
    expect(redis.set).toHaveBeenCalledWith(`threads:acme:${thread.id}`, thread, { ex: 90 * 24 * 60 * 60 });
    expect(redis.zadd).toHaveBeenCalledWith("threads:acme:index", { score: Date.parse(thread.updatedAt), member: thread.id });
    expect(redis.zremrangebyrank).toHaveBeenCalledWith("threads:acme:index", 0, -201);
    const updated = await updateThread("acme", thread.id, { title: "Cached revision" });
    expect(redis.set).toHaveBeenLastCalledWith(`threads:acme:${thread.id}`, updated, { ex: 90 * 24 * 60 * 60 });
    expect(await getThread("acme", thread.id)).toEqual(updated);
    await deleteThread("acme", thread.id);
    expect(redis.del).toHaveBeenCalledWith(`threads:acme:${thread.id}`);
    expect(redis.zrem).toHaveBeenCalledWith("threads:acme:index", thread.id);
    expect(await getThread("acme", thread.id)).toBeNull();
    expect(files.writeFile).not.toHaveBeenCalled();
  });
  it("retains committed create, update and deletion when the rollback cache is unavailable", async () => {
    const redis = { set: vi.fn(async () => { throw new Error("cache offline"); }), del: vi.fn(async () => { throw new Error("cache offline"); }), zadd: vi.fn(), zremrangebyrank: vi.fn(), zrem: vi.fn() };
    storage.redis = redis;
    const thread = await createThread("acme", "Durable cache outage");
    expect(await getThread("acme", thread.id)).toEqual(thread);
    const updated = await updateThread("acme", thread.id, { title: "Durable revision" });
    expect(await getThread("acme", thread.id)).toEqual(updated);
    await deleteThread("acme", thread.id);
    expect(await getThread("acme", thread.id)).toBeNull();
    expect(redis.set).toHaveBeenCalledTimes(2);
    expect(redis.del).toHaveBeenCalledTimes(1);
    expect(files.writeFile).not.toHaveBeenCalled();
  });
  it("preserves local file create, update and deletion when durable reads are not selected", async () => {
    vi.stubEnv("STRELVA_CLIENT_RECORDS_READ", "");
    const thread = await createThread("acme", "Local conversation");
    expect(await getThread("acme", thread.id)).toEqual(thread);
    const updated = await updateThread("acme", thread.id, { title: "Local revision" });
    expect(await getThread("acme", thread.id)).toEqual(updated);
    await deleteThread("acme", thread.id);
    expect(await getThread("acme", thread.id)).toBeNull();
    expect(rows.size).toBe(0);
    expect(files.writeFile).toHaveBeenCalledTimes(3);
  });
});
