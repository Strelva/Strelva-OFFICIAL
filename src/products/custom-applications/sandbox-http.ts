import { gzipSync } from "node:zlib";
import { z } from "zod";
import type { VercelSandboxBuildPort } from "./vercel-sandbox-build";

// Narrow HTTP binding to the endpoints/shapes in @vercel/sandbox 3.5.1's
// published APIClient. No package install, retries, arbitrary origin or guest credentials.
const sessionSchema = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/), memory: z.number(), vcpus: z.number(), region: z.string(), timeout: z.number(), status: z.string(), networkPolicy: z.object({ mode: z.literal("deny-all") }), activeCpuDurationMs: z.number().optional(), networkTransfer: z.object({ ingress: z.number(), egress: z.number() }).optional() });
const createSchema = z.object({ session: sessionSchema, sandbox: z.object({ name: z.string(), image: z.string(), persistent: z.boolean(), currentSessionId: z.string() }), routes: z.array(z.unknown()) });
const commandSchema = z.object({ command: z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/), sessionId: z.string(), exitCode: z.number().int().nullable() }) });
async function boundedBytes(response: Response, maximum: number): Promise<Buffer> {
  if (!response.body) throw new Error("Sandbox provider response is unavailable.");
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let count = 0;
  try { for (;;) { const part = await reader.read(); if (part.done) break; count += part.value.length; if (count > maximum) throw new Error("Sandbox response exceeds its limit."); chunks.push(part.value); } }
  finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  return Buffer.concat(chunks);
}
/** Standard USTAR archive using Node builtins, bounded regular files only. */
export function sandboxSourceArchive(files: { path: string; content: Buffer; mode: number }[]): Buffer {
  if (!files.length || files.length > 100) throw new Error("Invalid Sandbox source archive.");
  const blocks: Buffer[] = []; const names = new Set<string>(); let total = 0;
  const octal = (value: number, length: number) => value.toString(8).padStart(length - 1, "0") + "\0";
  for (const file of files) {
    if (!file.path.startsWith("/vercel/sandbox/strelva-source/") || file.mode !== 0o444 || file.path.includes("\0") || file.path.split("/").some(part => part === "." || part === "..")) throw new Error("Invalid Sandbox source path.");
    const path = file.path.slice("/vercel/sandbox/".length);
    if (names.has(path)) throw new Error("Duplicate Sandbox source path."); names.add(path);
    total += file.content.length; if (total > 600_000) throw new Error("Sandbox source exceeds its limit.");
    let name = path, prefix = "";
    if (Buffer.byteLength(name) > 100) { const split = path.lastIndexOf("/"); name = path.slice(split + 1); prefix = path.slice(0, split); }
    if (Buffer.byteLength(name) > 100 || Buffer.byteLength(prefix) > 155) throw new Error("Sandbox source path exceeds USTAR limits.");
    const header = Buffer.alloc(512); header.write(name, 0); header.write(octal(file.mode, 8), 100); header.write(octal(0, 8), 108); header.write(octal(0, 8), 116);
    header.write(octal(file.content.length, 12), 124); header.write(octal(0, 12), 136); header.fill(32, 148, 156); header.write("0", 156); header.write("ustar\0", 257); header.write("00", 263); header.write(prefix, 345);
    const checksum = header.reduce((sum, byte) => sum + byte, 0); header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148);
    blocks.push(header, file.content, Buffer.alloc((512 - file.content.length % 512) % 512));
  }
  blocks.push(Buffer.alloc(1024)); return gzipSync(Buffer.concat(blocks));
}
export function createSandboxHttpPort(config: { teamId: string; projectId: string; token: () => string; approved: () => boolean }, fetcher: typeof fetch = fetch): VercelSandboxBuildPort {
  const teamId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).parse(config.teamId);
  const projectId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).parse(config.projectId);
  const request = async (path: string, signal: AbortSignal, body?: unknown, archive?: Buffer, cleanup = false) => {
    if (!cleanup && !config.approved()) throw new Error("Sandbox provider is not approved.");
    const token = config.token(); if (!token || /[\r\n]/.test(token)) throw new Error("Sandbox credentials are unavailable.");
    const url = new URL(`https://vercel.com/api${path}`); url.searchParams.set("teamId", teamId);
    const response = await fetcher(url, { method: body === undefined && !archive ? "GET" : "POST", signal, redirect: "error", cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": archive ? "application/gzip" : "application/json", ...(archive ? { "x-cwd": "/vercel/sandbox" } : {}) },
      body: archive ? new Uint8Array(archive) : body === undefined ? undefined : JSON.stringify(body) });
    if (!response.ok) { await response.body?.cancel(); throw new Error("Sandbox provider request could not be confirmed."); }
    return response;
  };
  const json = async (path: string, signal: AbortSignal, body?: unknown, cleanup = false) => JSON.parse((await boundedBytes(await request(path, signal, body, undefined, cleanup), 64_000)).toString("utf8"));
  return { async create(options) {
    const created = createSchema.parse(await json("/v3/sandboxes", options.signal, { ...options, signal: undefined, projectId, networkPolicy: { mode: "deny-all" } }));
    const sessionId = created.session.id; const base = `/v2/sandboxes/sessions/${sessionId}`;
    const validate = (session: z.infer<typeof sessionSchema>) => {
      if (session.id !== sessionId || session.memory !== 2048 || session.vcpus !== 1 || session.region !== options.region || session.timeout !== options.timeout) throw new Error("Sandbox session configuration changed.");
      return session;
    };
    let session = validate(created.session);
    const ready = async (signal: AbortSignal) => {
      while (session.status === "pending") {
        signal.throwIfAborted();
        await new Promise<void>((resolve, reject) => {
          const abort = () => { clearTimeout(timer); reject(signal.reason); };
          const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, 100);
          signal.addEventListener("abort", abort, { once: true });
          if (signal.aborted) abort();
        });
        session = validate(sessionSchema.parse((await json(base, signal) as { session: unknown }).session));
      }
      if (session.status !== "running") throw new Error("Sandbox session is not running.");
    };
    if (created.sandbox.currentSessionId !== sessionId || created.routes.length) throw new Error("Sandbox session scope mismatch.");
    return { ...created.sandbox, memory: session.memory, vcpus: session.vcpus, currentSession: () => ({ sessionId }),
      async writeFiles(files, { signal }) { await ready(signal); const archive = sandboxSourceArchive(files); await boundedBytes(await request(`${base}/fs/write`, signal, {}, archive), 64_000); },
      async runCommand(command) {
        await ready(command.signal);
        const started = commandSchema.parse(await json(`${base}/cmd`, command.signal, { command: command.cmd, args: command.args, cwd: command.cwd, env: command.env, sudo: command.sudo }));
        if (started.command.sessionId !== sessionId) throw new Error("Sandbox command scope mismatch.");
        const completed = started.command.exitCode !== null ? started : commandSchema.parse(await json(`${base}/cmd/${started.command.id}?wait=true`, command.signal));
        if (completed.command.id !== started.command.id || completed.command.sessionId !== sessionId || completed.command.exitCode === null) throw new Error("Sandbox command completion is unknown.");
        return { exitCode: completed.command.exitCode };
      },
      async readFileToBuffer(file, { signal }) {
        await ready(signal); if (file.path !== "/output/index.html") throw new Error("Invalid Sandbox artifact path.");
        const response = await request(`${base}/fs/read`, signal, { path: file.path, cwd: "/" });
        if (!response.headers.get("content-type")?.includes("application/octet-stream")) throw new Error("Invalid Sandbox artifact response.");
        return boundedBytes(response, 512_000);
      },
      async stop({ signal }) {
        // Cleanup remains authorized after the new-build gate is withdrawn.
        const stopped = sessionSchema.parse((await json(`${base}/stop`, signal, {}, true) as { session: unknown }).session);
        validate(stopped); if (stopped.status !== "stopped") throw new Error("Sandbox stop is unconfirmed.");
        return { activeCpuDurationMs: stopped.activeCpuDurationMs, networkTransfer: stopped.networkTransfer };
      },
    };
  } };
}
