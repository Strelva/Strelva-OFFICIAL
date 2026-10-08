/**
 * A disposable redis-server on a Unix socket (no TCP listener, no persistence)
 * plus a small Upstash-shaped client over redis-cli. Every call is a real Redis
 * command, so types, Lua, RENAME, TTLs and WRONGTYPE errors behave as in
 * production. Tests mock `@/lib/redis` to return `isolated.client`.
 */
import { execFileSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const isolatedRedisAvailable =
  !spawnSync("redis-server", ["--version"]).error && !spawnSync("redis-cli", ["--version"]).error;

type SetOptions = { px?: number; ex?: number; nx?: boolean };

export interface IsolatedRedis {
  cli(...args: string[]): unknown;
  client: ReturnType<typeof createClient>;
  stop(): Promise<void>;
}

function decode(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try { return JSON.parse(raw); } catch { return raw; }
}

function createClient(cli: (...args: string[]) => unknown) {
  return {
    eval: async (script: string, keys: string[], args: string[]) => cli("EVAL", script, String(keys.length), ...keys, ...args.map(String)),
    get: async <T = unknown>(key: string) => decode(cli("GET", key)) as T | null,
    mget: async <T = unknown[]>(...keys: string[]) => (cli("MGET", ...keys) as unknown[]).map(decode) as T,
    set: async (key: string, value: unknown, opts?: SetOptions) => {
      const encoded = typeof value === "string" ? value : JSON.stringify(value);
      const extra = [
        ...(opts?.px ? ["PX", String(opts.px)] : opts?.ex ? ["EX", String(opts.ex)] : []),
        ...(opts?.nx ? ["NX"] : []),
      ];
      return cli("SET", key, encoded, ...extra);
    },
    del: async (...keys: string[]) => (keys.length ? cli("DEL", ...keys) : 0),
    exists: async (...keys: string[]) => cli("EXISTS", ...keys),
    pttl: async (key: string) => cli("PTTL", key),
    type: async (key: string) => cli("TYPE", key),
    hgetall: async <T = Record<string, unknown>>(key: string) => cli("HGETALL", key) as T | null,
    lrange: async <T = unknown[]>(key: string, start: number, stop: number) => (cli("LRANGE", key, String(start), String(stop)) as unknown[]).map(decode) as T,
    sadd: async (key: string, ...members: string[]) => cli("SADD", key, ...members),
    srem: async (key: string, ...members: string[]) => cli("SREM", key, ...members),
    smembers: async (key: string) => cli("SMEMBERS", key),
    zadd: async (key: string, entry: { score: number; member: string }) => cli("ZADD", key, String(entry.score), entry.member),
    zrem: async (key: string, ...members: string[]) => cli("ZREM", key, ...members),
    zcard: async (key: string) => cli("ZCARD", key),
    zremrangebyrank: async (key: string, start: number, stop: number) => cli("ZREMRANGEBYRANK", key, String(start), String(stop)),
    zrange: async (key: string, start: number, stop: number, opts?: { withScores?: boolean; rev?: boolean }) => {
      const rows = cli("ZRANGE", key, String(start), String(stop), ...(opts?.rev ? ["REV"] : []), ...(opts?.withScores ? ["WITHSCORES"] : [])) as unknown[];
      return opts?.withScores ? (rows as [string, number][]).flat() : rows;
    },
    scan: async (cursor: string | number, opts: { match: string; count: number }) => {
      const [next, keys] = cli("SCAN", String(cursor), "MATCH", opts.match, "COUNT", String(opts.count)) as [string, string[]];
      return [next, keys] as [string, string[]];
    },
  };
}

export async function startIsolatedRedis(prefix: string): Promise<IsolatedRedis> {
  const directory = mkdtempSync(join(tmpdir(), `${prefix}-`));
  const socket = join(directory, "redis.sock");
  const server: ChildProcess = spawn("redis-server", ["--port", "0", "--unixsocket", socket, "--save", "", "--appendonly", "no"], { stdio: "ignore" });
  const cli = (...args: string[]): unknown => {
    const out = execFileSync("redis-cli", ["-s", socket, "--json", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const parsed = JSON.parse(out) as unknown;
    if (typeof parsed === "string" && /^(WRONGTYPE|ERR)/.test(parsed)) throw new Error(parsed);
    return parsed;
  };
  for (let attempt = 0; ; attempt++) {
    try { if (cli("PING") === "PONG") break; } catch { /* starting */ }
    if (attempt > 200) throw new Error("isolated redis-server did not start");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return {
    cli,
    client: createClient(cli),
    async stop() {
      const stopped = new Promise<void>((resolve) => server.once("exit", () => resolve()));
      server.kill("SIGTERM");
      await stopped;
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
