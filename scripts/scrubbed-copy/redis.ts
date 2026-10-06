/**
 * Redis plumbing for the scrubbed copy, without new dependencies.
 *
 * - RespClient: a minimal RESP client for the local redis-server on a unix socket.
 * - startUpstashBridge: the Upstash REST protocol (what src/lib/redis.ts speaks)
 *   on 127.0.0.1, forwarding to the local redis-server, so `pnpm dev`, the
 *   conversion CLI and tests read the copy through the app's real client.
 * - ReadOnlyRestSource: the production reader. It sends only allowlisted read
 *   commands; anything else throws before a request is made.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createConnection, type Socket } from "node:net";
import { timingSafeEqual } from "node:crypto";
import { assertLoopbackBind } from "./safety";
import { toolEnv } from "./postgres";
import type { RedisValue } from "./policy";

// ---------------------------------------------------------------------------
// RESP
// ---------------------------------------------------------------------------

const INCOMPLETE = Symbol("incomplete");
export type RespReply = string | number | null | RespError | RespReply[] | { simple: string };
export class RespError extends Error {}

function parseReply(buffer: Buffer, offset: number): { value: RespReply; offset: number } | typeof INCOMPLETE {
  const end = buffer.indexOf("\r\n", offset);
  if (end === -1) return INCOMPLETE;
  const type = String.fromCharCode(buffer[offset]!);
  const line = buffer.toString("utf8", offset + 1, end);
  const next = end + 2;
  if (type === "+") return { value: { simple: line }, offset: next };
  if (type === "-") return { value: new RespError(line), offset: next };
  if (type === ":") return { value: Number(line), offset: next };
  if (type === "$") {
    const length = Number(line);
    if (length < 0) return { value: null, offset: next };
    if (buffer.length < next + length + 2) return INCOMPLETE;
    return { value: buffer.toString("utf8", next, next + length), offset: next + length + 2 };
  }
  if (type === "*") {
    const count = Number(line);
    if (count < 0) return { value: null, offset: next };
    const items: RespReply[] = [];
    let cursor = next;
    for (let index = 0; index < count; index += 1) {
      const item = parseReply(buffer, cursor);
      if (item === INCOMPLETE) return INCOMPLETE;
      items.push(item.value);
      cursor = item.offset;
    }
    return { value: items, offset: cursor };
  }
  throw new Error(`Unexpected RESP type ${type}`);
}

function encodeCommand(args: Array<string | number>): Buffer {
  const parts: Buffer[] = [Buffer.from(`*${args.length}\r\n`)];
  for (const arg of args) {
    const value = Buffer.from(String(arg), "utf8");
    parts.push(Buffer.from(`$${value.length}\r\n`), value, Buffer.from("\r\n"));
  }
  return Buffer.concat(parts);
}

export class RespClient {
  private buffer = Buffer.alloc(0);
  private readonly waiting: Array<{ resolve: (value: RespReply) => void; reject: (error: Error) => void }> = [];
  private constructor(private readonly socket: Socket) {
    socket.on("data", (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      for (;;) {
        const parsed = parseReply(this.buffer, 0);
        if (parsed === INCOMPLETE) break;
        this.buffer = this.buffer.subarray(parsed.offset);
        this.waiting.shift()?.resolve(parsed.value);
      }
    });
    socket.on("error", (error) => { for (const waiter of this.waiting.splice(0)) waiter.reject(error); });
  }

  static connect(socketPath: string): Promise<RespClient> {
    return new Promise((resolve, reject) => {
      const socket = createConnection(socketPath);
      socket.once("connect", () => resolve(new RespClient(socket)));
      socket.once("error", reject);
    });
  }

  /** Raw reply; a server error is returned, not thrown. */
  send(args: Array<string | number>): Promise<RespReply> {
    return new Promise((resolve, reject) => {
      this.waiting.push({ resolve, reject });
      this.socket.write(encodeCommand(args));
    });
  }

  async call(args: Array<string | number>): Promise<RespReply> {
    const reply = await this.send(args);
    if (reply instanceof RespError) throw reply;
    return reply;
  }

  close(): void {
    this.socket.end();
  }
}

// ---------------------------------------------------------------------------
// Local redis-server
// ---------------------------------------------------------------------------

export interface LocalRedis {
  socket: string;
  process: ChildProcess;
  stop(save: boolean): Promise<void>;
}

/** Unix socket only (no TCP port), persistence to dump.rdb in dataDir. */
export async function startLocalRedis(dataDir: string, socket: string): Promise<LocalRedis> {
  const child = spawn("redis-server", [
    "--port", "0",
    "--unixsocket", socket,
    "--unixsocketperm", "700",
    "--dir", dataDir,
    "--dbfilename", "dump.rdb",
    "--save", "",
    "--appendonly", "no",
    "--logfile", `${dataDir}/redis.log`,
  ], { stdio: "ignore", env: toolEnv() as NodeJS.ProcessEnv });
  const started = Date.now();
  while (!existsSync(socket)) {
    if (child.exitCode !== null) throw new Error(`redis-server exited early; see ${dataDir}/redis.log`);
    if (Date.now() - started > 10_000) throw new Error("redis-server did not start within 10 seconds.");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const probe = await RespClient.connect(socket);
      await probe.call(["PING"]);
      probe.close();
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  return {
    socket,
    process: child,
    async stop(save: boolean) {
      if (child.exitCode !== null) return;
      const exited = new Promise((resolve) => child.once("exit", resolve));
      // SHUTDOWN closes the connection without a reply, so persist with SAVE
      // (which does reply) and then stop the process by signal.
      if (save) {
        const client = await RespClient.connect(socket);
        try {
          await client.call(["SAVE"]);
        } finally {
          client.close();
        }
      }
      child.kill("SIGTERM");
      const timer = setTimeout(() => child.kill("SIGKILL"), 5_000);
      await exited;
      clearTimeout(timer);
    },
  };
}

/** Write scrubbed records into the local server. Expired records are skipped. */
export async function loadRedisRecords(client: RespClient, records: Array<{ key: string; data: RedisValue; expireAtMs: number | null }>, now = Date.now()): Promise<{ loaded: number; expired: number }> {
  let loaded = 0;
  let expired = 0;
  for (const record of records) {
    if (record.expireAtMs !== null && record.expireAtMs <= now) { expired += 1; continue; }
    await client.call(["DEL", record.key]);
    const data = record.data;
    if (data.type === "string") await client.call(["SET", record.key, data.value]);
    else if (data.type === "zset" && data.value.length) await client.call(["ZADD", record.key, ...data.value.flatMap(([member, score]) => [score, member])]);
    else if (data.type === "set" && data.value.length) await client.call(["SADD", record.key, ...data.value]);
    else if (data.type === "list" && data.value.length) await client.call(["RPUSH", record.key, ...data.value]);
    else if (data.type === "hash" && Object.keys(data.value).length) await client.call(["HSET", record.key, ...Object.entries(data.value).flat()]);
    else continue;
    if (record.expireAtMs !== null) await client.call(["PEXPIREAT", record.key, record.expireAtMs]);
    loaded += 1;
  }
  return { loaded, expired };
}

// ---------------------------------------------------------------------------
// Upstash REST bridge
// ---------------------------------------------------------------------------

/** Commands that could move the copy off this machine or reconfigure the server. */
const BRIDGE_BLOCKED = new Set(["MIGRATE", "REPLICAOF", "SLAVEOF", "CONFIG", "MODULE", "DEBUG", "SHUTDOWN", "SYNC", "PSYNC", "ACL", "FAILOVER", "CLUSTER"]);

function toUpstash(reply: RespReply, base64: boolean, top: boolean): unknown {
  if (reply === null || typeof reply === "number") return reply;
  if (reply instanceof RespError) return { error: reply.message };
  if (Array.isArray(reply)) return reply.map((item) => toUpstash(item, base64, false));
  if (typeof reply === "object" && "simple" in reply) {
    if (top && reply.simple === "OK") return "OK";
    return base64 ? Buffer.from(reply.simple, "utf8").toString("base64") : reply.simple;
  }
  return base64 ? Buffer.from(reply, "utf8").toString("base64") : reply;
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 32 * 1024 * 1024) { reject(new Error("body too large")); request.destroy(); return; }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function isCommand(value: unknown): value is Array<string | number> {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string" || typeof item === "number" || typeof item === "boolean");
}

export interface UpstashBridge {
  url: string;
  token: string;
  close(): Promise<void>;
}

export async function startUpstashBridge(options: { socket: string; token: string; host?: string; port?: number }): Promise<UpstashBridge> {
  const host = options.host ?? "127.0.0.1";
  assertLoopbackBind(host);
  const expected = Buffer.from(`Bearer ${options.token}`);
  // One connection per request keeps MULTI/EXEC isolated without a pool.
  const run = async (commands: Array<Array<string | number>>, multi: boolean): Promise<RespReply[]> => {
    const client = await RespClient.connect(options.socket);
    try {
      if (multi) await client.call(["MULTI"]);
      const replies: RespReply[] = [];
      for (const command of commands) {
        const name = String(command[0]).toUpperCase();
        if (BRIDGE_BLOCKED.has(name)) { replies.push(new RespError(`ERR ${name} is disabled on the scrubbed copy`)); continue; }
        replies.push(await client.send(command.map((item) => (typeof item === "boolean" ? String(item) : item))));
      }
      if (!multi) return replies;
      const exec = await client.send(["EXEC"]);
      return Array.isArray(exec) ? exec : [exec];
    } finally {
      client.close();
    }
  };
  const server: Server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const send = (status: number, body: unknown) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };
    try {
      const auth = Buffer.from(request.headers.authorization ?? "");
      if (auth.length !== expected.length || !timingSafeEqual(auth, expected)) return send(401, { error: "Unauthorized" });
      if (request.method !== "POST") return send(405, { error: "Use POST" });
      const base64 = String(request.headers["upstash-encoding"] ?? "").toLowerCase() === "base64";
      const path = (request.url ?? "/").split("?")[0]!.replace(/\/+$/, "");
      const body: unknown = JSON.parse((await readBody(request)) || "null");
      if (path === "/pipeline" || path === "/multi-exec") {
        if (!Array.isArray(body) || !body.every(isCommand)) return send(400, { error: "Expected an array of commands" });
        const replies = await run(body, path === "/multi-exec");
        return send(200, replies.map((reply) => (reply instanceof RespError ? { error: reply.message } : { result: toUpstash(reply, base64, true) })));
      }
      if (path === "" || path === "/") {
        if (!isCommand(body)) return send(400, { error: "Expected a command array" });
        const [reply] = await run([body], false);
        if (reply instanceof RespError) return send(400, { error: reply.message });
        return send(200, { result: toUpstash(reply ?? null, base64, true) });
      }
      return send(404, { error: "Unknown path" });
    } catch (error) {
      return send(500, { error: error instanceof Error ? error.message : "bridge failure" });
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, host, () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("The bridge did not bind a TCP port.");
  return {
    url: `http://127.0.0.1:${address.port}`,
    token: options.token,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

// ---------------------------------------------------------------------------
// Read-only production source (Upstash REST)
// ---------------------------------------------------------------------------

export const READ_ONLY_REDIS_COMMANDS = new Set(["PING", "SCAN", "TYPE", "PTTL", "GET", "ZRANGE", "SMEMBERS", "HGETALL", "LRANGE", "DBSIZE"]);

function decodeBase64Deep(value: unknown): unknown {
  if (typeof value === "string") return value === "OK" ? value : Buffer.from(value, "base64").toString("utf8");
  if (Array.isArray(value)) return value.map(decodeBase64Deep);
  return value;
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export class ReadOnlyRestSource {
  constructor(private readonly url: string, private readonly token: string, private readonly fetcher: FetchLike = fetch as unknown as FetchLike) {}

  /** Every request passes through here; a non-read command never leaves the process. */
  async pipeline(commands: Array<Array<string | number>>): Promise<unknown[]> {
    for (const command of commands) {
      const name = String(command[0] ?? "").toUpperCase();
      if (!READ_ONLY_REDIS_COMMANDS.has(name)) throw new Error(`Refusing to send ${name || "an empty command"} to the source: the copy only reads.`);
    }
    if (!commands.length) return [];
    const response = await this.fetcher(`${this.url.replace(/\/+$/, "")}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Upstash-Encoding": "base64", "content-type": "application/json" },
      body: JSON.stringify(commands),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Source Redis returned HTTP ${response.status}.`);
    const parsed = JSON.parse(text) as Array<{ result?: unknown; error?: string }>;
    return parsed.map((item, index) => {
      if (item.error) throw new Error(`Source Redis rejected ${String(commands[index]?.[0])}: ${item.error}`);
      return decodeBase64Deep(item.result);
    });
  }

  async call(command: Array<string | number>): Promise<unknown> {
    const [result] = await this.pipeline([command]);
    return result;
  }

  async scanAll(count = 500): Promise<string[]> {
    const keys = new Set<string>();
    let cursor = "0";
    do {
      const reply = await this.call(["SCAN", cursor, "COUNT", count]) as [string, string[]];
      cursor = String(reply[0]);
      for (const key of reply[1] ?? []) keys.add(key);
    } while (cursor !== "0");
    return [...keys].sort();
  }

  /** TYPE + PTTL + value for each key, read in pipelines of 50. */
  async readKeys(keys: string[], now: () => number = Date.now): Promise<Array<{ key: string; data: RedisValue | null; expireAtMs: number | null }>> {
    const out: Array<{ key: string; data: RedisValue | null; expireAtMs: number | null }> = [];
    for (let index = 0; index < keys.length; index += 50) {
      const batch = keys.slice(index, index + 50);
      const meta = await this.pipeline(batch.flatMap((key) => [["TYPE", key], ["PTTL", key]]));
      const capturedAt = now();
      const reads: Array<Array<string | number>> = [];
      const types: string[] = [];
      batch.forEach((key, position) => {
        const type = String(meta[position * 2]);
        types.push(type);
        if (type === "string") reads.push(["GET", key]);
        else if (type === "zset") reads.push(["ZRANGE", key, 0, -1, "WITHSCORES"]);
        else if (type === "set") reads.push(["SMEMBERS", key]);
        else if (type === "list") reads.push(["LRANGE", key, 0, -1]);
        else if (type === "hash") reads.push(["HGETALL", key]);
        else reads.push(["PING"]);
      });
      const values = await this.pipeline(reads);
      batch.forEach((key, position) => {
        const type = types[position]!;
        const ttl = Number(meta[position * 2 + 1]);
        const raw = values[position];
        out.push({ key, data: toRedisValue(type, raw), expireAtMs: ttl >= 0 ? capturedAt + ttl : null });
      });
    }
    return out;
  }
}

export function toRedisValue(type: string, raw: unknown): RedisValue | null {
  if (type === "string" && typeof raw === "string") return { type: "string", value: raw };
  if (type === "zset" && Array.isArray(raw)) {
    const pairs: Array<[string, number]> = [];
    for (let index = 0; index + 1 < raw.length; index += 2) pairs.push([String(raw[index]), Number(raw[index + 1])]);
    return { type: "zset", value: pairs };
  }
  if (type === "set" && Array.isArray(raw)) return { type: "set", value: raw.map(String).sort() };
  if (type === "list" && Array.isArray(raw)) return { type: "list", value: raw.map(String) };
  if (type === "hash" && Array.isArray(raw)) {
    const hash: Record<string, string> = {};
    for (let index = 0; index + 1 < raw.length; index += 2) hash[String(raw[index])] = String(raw[index + 1]);
    return { type: "hash", value: hash };
  }
  return null;
}
