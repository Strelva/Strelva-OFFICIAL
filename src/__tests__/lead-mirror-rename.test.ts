import { execFileSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const transport = vi.hoisted(() => ({ eval: vi.fn(), get: vi.fn(), set: vi.fn(), del: vi.fn(), zrange: vi.fn(), scan: vi.fn() }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => transport }));
import { rekeyTenantRedis } from "@/lib/tenant-rename";
import { LEAD_MIRROR_LAST_FAILURE_KEY, LEAD_MIRROR_PENDING_KEY } from "@/lib/lead-mirror";

// Exercise the actual Lua against a disposable Unix-socket Redis instance.
// No TCP listener, credentials, external service, or persistent database.
const available = !spawnSync("redis-server", ["--version"]).error && !spawnSync("redis-cli", ["--version"]).error;
describe.skipIf(!available)("pending lead repairs across tenant rename (isolated Redis)", () => {
  let directory: string;
  let socket: string;
  let server: ChildProcess;
  const command = (...args: string[]) => JSON.parse(execFileSync("redis-cli", ["-s", socket, "--json", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), "lead-rename-")); socket = join(directory, "redis.sock");
    server = spawn("redis-server", ["--port", "0", "--unixsocket", socket, "--save", "", "--appendonly", "no"], { stdio: "ignore" });
    await vi.waitFor(() => expect(command("PING")).toBe("PONG"));
  });
  afterAll(async () => {
    if (server) { const stopped = new Promise<void>(resolve => server.once("exit", () => resolve())); server.kill("SIGTERM"); await stopped; }
    if (directory) rmSync(directory, { recursive: true, force: true });
  });
  beforeEach(() => {
    command("FLUSHDB"); vi.resetAllMocks();
    transport.eval.mockImplementation(async (script: string, keys: string[], args: string[]) => command("EVAL", script, String(keys.length), ...keys, ...args));
    transport.zrange.mockResolvedValue([]); transport.scan.mockResolvedValue(["0", []]); transport.del.mockResolvedValue(0);
  });
  const seed = (slug: string, id: string, score: number) => {
    command("SET", `lead:${slug}:${id}`, JSON.stringify({ id, name: "A visitor" }), "EX", "3600");
    command("ZADD", LEAD_MIRROR_PENDING_KEY, String(score), `${slug}:${id}`);
  };
  it("moves readable payload and pending identity together, preserves scores and TTL, and rewrites only the renamed diagnostic", async () => {
    seed("old", "lead_one", 100); seed("oldtown", "lead_other", 200);
    command("ZADD", LEAD_MIRROR_PENDING_KEY, "80", "new:lead_one");
    command("SET", LEAD_MIRROR_LAST_FAILURE_KEY, JSON.stringify({ tenant: "old", leadId: "lead_one", reason: "timeout", at: "2026-10-05" }));
    await expect(rekeyTenantRedis("old", "new")).resolves.toMatchObject({ redisErrors: [], rewrittenBlobs: 1 });
    expect(command("GET", "lead:old:lead_one")).toBe(null);
    expect(JSON.parse(command("GET", "lead:new:lead_one"))).toMatchObject({ id: "lead_one" });
    expect(command("TTL", "lead:new:lead_one")).toBeGreaterThan(3500);
    expect(command("ZRANGE", LEAD_MIRROR_PENDING_KEY, "0", "-1", "WITHSCORES")).toEqual([["new:lead_one", 80], ["oldtown:lead_other", 200]]);
    expect(JSON.parse(command("GET", LEAD_MIRROR_LAST_FAILURE_KEY))).toEqual({ tenant: "new", leadId: "lead_one", reason: "timeout", at: "2026-10-05" });
    await rekeyTenantRedis("old", "new");
    expect(command("ZSCORE", LEAD_MIRROR_PENDING_KEY, "new:lead_one")).toBe(80);
  });
  it("retains the source payload and pending member if migration fails, then safely retries even after a lost acknowledgement", async () => {
    seed("old", "lead_one", 100);
    transport.eval.mockRejectedValueOnce(new Error("Redis unavailable"));
    const failed = await rekeyTenantRedis("old", "new");
    expect(failed.redisErrors).toEqual(["lead-mirror: Redis unavailable"]);
    expect(command("GET", "lead:old:lead_one")).not.toBe(null);
    expect(command("ZSCORE", LEAD_MIRROR_PENDING_KEY, "old:lead_one")).toBe(100);
    const execute = transport.eval.getMockImplementation()!;
    transport.eval.mockImplementationOnce(async (...args: unknown[]) => { await execute(...args); throw new Error("Response lost after commit"); });
    expect((await rekeyTenantRedis("old", "new")).redisErrors).toEqual(["lead-mirror: Response lost after commit"]);
    await rekeyTenantRedis("old", "new");
    expect(command("ZRANGE", LEAD_MIRROR_PENDING_KEY, "0", "-1", "WITHSCORES")).toEqual([["new:lead_one", 100]]);
    expect(command("GET", "lead:new:lead_one")).not.toBe(null);
    // A worker holding the old member cannot remove the migrated retry.
    command("ZREM", LEAD_MIRROR_PENDING_KEY, "old:lead_one");
    expect(command("ZSCORE", LEAD_MIRROR_PENDING_KEY, "new:lead_one")).toBe(100);
  });
  it("repairs a previous partial rename without dropping unresolved members or another tenant's diagnostic", async () => {
    seed("old", "lead_one", 100);
    command("RENAME", "lead:old:lead_one", "lead:new:lead_one");
    command("ZADD", LEAD_MIRROR_PENDING_KEY, "50", "old:lead_missing");
    command("SET", LEAD_MIRROR_LAST_FAILURE_KEY, JSON.stringify({ tenant: "other", leadId: "lead_other", reason: "error" }));
    await rekeyTenantRedis("old", "new");
    expect(command("ZRANGE", LEAD_MIRROR_PENDING_KEY, "0", "-1", "WITHSCORES")).toEqual([["old:lead_missing", 50], ["new:lead_one", 100]]);
    expect(JSON.parse(command("GET", LEAD_MIRROR_LAST_FAILURE_KEY))).toEqual({ tenant: "other", leadId: "lead_other", reason: "error" });
  });
});
