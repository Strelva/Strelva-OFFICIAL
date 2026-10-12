/** A task-owned Redis socket with asynchronous commands for concurrent bursts.
 * No ambient URL, TCP port, persistence, or additional dependency. */
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

type Reply = string | number | null | Error | Reply[];
const incomplete = Symbol("incomplete");
function parse(buffer: Buffer, offset = 0): { value: Reply; next: number } | typeof incomplete {
  const end = buffer.indexOf("\r\n", offset);
  if (end < 0) return incomplete;
  const kind = buffer.toString("ascii", offset, offset + 1);
  const line = buffer.toString("utf8", offset + 1, end);
  let next = end + 2;
  if (kind === "+") return { value: line, next };
  if (kind === "-") return { value: new Error(line), next };
  if (kind === ":") return { value: Number(line), next };
  if (kind === "$") {
    const length = Number(line);
    if (length < 0) return { value: null, next };
    if (buffer.length < next + length + 2) return incomplete;
    return { value: buffer.toString("utf8", next, next + length), next: next + length + 2 };
  }
  if (kind === "*") {
    const count = Number(line), value: Reply[] = [];
    if (count < 0) return { value: null, next };
    for (let i = 0; i < count; i++) {
      const item = parse(buffer, next);
      if (item === incomplete) return incomplete;
      value.push(item.value); next = item.next;
    }
    return { value, next };
  }
  throw new Error("Unexpected Redis reply");
}

function connect(path: string) {
  let buffer: Buffer = Buffer.alloc(0);
  let failure: Error | undefined;
  const pending: Array<{ resolve: (value: Reply) => void; reject: (error: Error) => void }> = [];
  const fail = (error: Error) => {
    failure = error;
    for (const waiter of pending.splice(0)) waiter.reject(error);
  };
  const socket = createConnection(path);
  socket.on("error", fail);
  socket.on("close", () => fail(new Error("Owned Redis socket closed")));
  socket.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const item = parse(buffer);
      if (item === incomplete) break;
      buffer = buffer.subarray(item.next);
      const waiter = pending.shift();
      if (item.value instanceof Error) waiter?.reject(item.value);
      else waiter?.resolve(item.value);
    }
  });
  const command = (...args: Array<string | number>): Promise<Reply> => {
    if (failure) return Promise.reject(failure);
    const parts = args.map(String);
    return new Promise((resolve, reject) => {
      pending.push({ resolve, reject });
      socket.write(`*${parts.length}\r\n${parts.map(p => `$${Buffer.byteLength(p)}\r\n${p}\r\n`).join("")}`);
    });
  };
  return { command, close: () => socket.destroy() };
}

export async function startPublicAbuseRedis() {
  const directory = await mkdtemp(join(tmpdir(), "strelva-public-abuse-"));
  const path = join(directory, "redis.sock");
  const server = spawn("redis-server", ["--port", "0", "--unixsocket", path, "--unixsocketperm", "700", "--save", "", "--appendonly", "no"], { stdio: "ignore" });
  let spawnError: Error | undefined;
  server.on("error", error => { spawnError = error; });
  const exited = new Promise<void>(resolve => { server.once("exit", () => resolve()); server.once("error", () => resolve()); });
  let connection: ReturnType<typeof connect> | undefined;
  const stop = async () => {
    connection?.close();
    if (server.exitCode === null && !spawnError) server.kill("SIGTERM");
    await exited;
    await rm(directory, { recursive: true, force: true });
  };
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (spawnError) throw spawnError;
      if (server.exitCode !== null) throw new Error("Owned Redis exited before readiness");
      const candidate = connect(path);
      try {
        if (await candidate.command("PING") === "PONG") { connection = candidate; break; }
      } catch { candidate.close(); }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    if (!connection) throw new Error("Owned Redis did not become ready");
    const command = connection.command;
    return { command, stop, client: {
      incr: (key: string) => command("INCR", key),
      expire: (key: string, seconds: number, mode: string) => command("EXPIRE", key, seconds, mode),
      get: (key: string) => command("GET", key),
      ttl: (key: string) => command("TTL", key),
    } };
  } catch (error) { await stop(); throw error; }
}
