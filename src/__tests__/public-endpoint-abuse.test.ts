/** #397: actual route handlers over loopback HTTP and an owned real Redis.
 * Native booking/tenant/capture/email ports are synthetic. No real business,
 * Postgres, provider, email, Next/proxy, or hosted ingress is qualified here. */
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { performance } from "node:perf_hooks";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startPublicAbuseRedis } from "./support/public-abuse-redis";

const ports = vi.hoisted(() => ({ redis: vi.fn(), tenant: vi.fn(), capture: vi.fn(), ready: vi.fn(), services: vi.fn(), hold: vi.fn(), updates: vi.fn(), spam: vi.fn() }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: ports.redis }));
vi.mock("@/platform/infra/production-guard", () => ({ isProductionEnv: () => true }));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: ports.tenant }));
vi.mock("@/lib/leads", () => ({ captureLead: ports.capture }));
vi.mock("@/lib/spam-pit", () => ({ recordSpam: ports.spam }));
vi.mock("@/platform/bookings/inquiry-offers", () => ({ captureInquiryBookingOffer: vi.fn() }));
vi.mock("@/products/inquiries", () => ({ notifyInquiryOwner: vi.fn(), inquiryDefinitionAtUse: vi.fn() }));
vi.mock("@/products/inquiries/server", () => ({
  INQUIRY_WORKSPACE_EXIT_CODE: "workspace_exit_future_work_blocked", InquiryWorkspaceExitUnavailableError: class extends Error {},
  getInquiryRepository: vi.fn(), inquiryReleaseEnabledForTenant: vi.fn(), projectPublishedInquiry: vi.fn(), recordInquiryEvidence: vi.fn(), resolveInquiryWorkspace: vi.fn(), validateInquiryFields: vi.fn(),
}));
vi.mock("@/platform/bookings/native", async original => ({ ...await original<typeof import("@/platform/bookings/native")>(),
  requireAgentBookings: ports.ready, nativeServices: ports.services, requestAgentBooking: ports.hold,
}));
vi.mock("@/platform/bookings/updates", () => ({ deliverBookingUpdates: ports.updates }));
vi.mock("@/app/api/mcp/_directory", () => ({ tenantDirectory: { scope: async (business: string) => business, list: async () => [] } }));

import { POST as mcp } from "@/app/api/mcp/public/route";
import { POST as alias } from "@/app/api/mcp/bookings/[tenant]/route";
import { POST as reserve } from "@/app/api/v1/bookings/[tenant]/reservations/route";
import { POST as lead } from "@/app/api/v1/leads/[tenant]/route";
import { AGENT_LIMITS } from "@/platform/agent-channel/limits";

const enabled = process.env.STRELVA_PUBLIC_ABUSE_REDIS === "1";
const OPENAI = "104.210.139.200", CLAUDE = "160.79.107.9";
let redis: Awaited<ReturnType<typeof startPublicAbuseRedis>>;
let server: Server;
let origin: string;
let run = 0;
type Sample = { status: number; body: Record<string, unknown>; ms: number };
const metrics: Array<Record<string, unknown>> = [];
// Bound simultaneous sockets, while every request still hits the real shared
// counter. An unbounded fixture burst can exhaust a developer host's listener.
const CONCURRENCY = 24;
let active = 0;
const waiting: Array<() => void> = [];

async function send(path: string, body: unknown, ip?: string): Promise<Sample> {
  if (active >= CONCURRENCY) await new Promise<void>(resolve => waiting.push(resolve));
  else active++;
  const started = performance.now();
  try {
  const response = await fetch(`${origin}${path}`, { method: "POST", headers: {
    "content-type": "application/json", "mcp-protocol-version": "2025-11-25", ...(ip ? { "x-forwarded-for": ip } : {}),
  }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json(), ms: performance.now() - started };
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}
const rpc = (name: string, args: Record<string, unknown>) => ({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
const read = (business: string, ip?: string, useAlias = false) => send(useAlias ? `/api/mcp/bookings/${business}` : "/api/mcp/public", rpc("list_services", useAlias ? {} : { business }), ip);
const holdBody = (i: number, email = `customer-${run}-${i}@example.test`, agent = `assistant-${i}`) => ({ serviceId: "svc", start: "2026-12-03T15:00:00Z", requestId: `request_${run}_${i}`, agent: { name: agent }, customer: { name: "Fixture Customer", email } });
const hold = (business: string, i: number, ip?: string, email?: string, endpoint = "mcp", agent?: string) => endpoint === "rest"
  ? send(`/api/v1/bookings/${business}/reservations`, { ...holdBody(i, email, agent), origin: "agent" }, ip)
  : send("/api/mcp/public", rpc("request_booking", { business, ...holdBody(i, email, agent) }), ip);
function report(name: string, samples: Sample[]) {
  const times = samples.map(s => s.ms).sort((a, b) => a - b);
  metrics.push({ name, concurrency: CONCURRENCY, queueTimeExcluded: true, requests: samples.length, statuses: samples.reduce<Record<string, number>>((counts, s) => ({ ...counts, [s.status]: (counts[s.status] ?? 0) + 1 }), {}),
    p50Ms: times[Math.floor(times.length * .5)], p95Ms: times[Math.floor(times.length * .95)], maxMs: times.at(-1) });
}

describe.runIf(enabled)("public endpoint abuse with real Redis and loopback HTTP", () => {
  beforeAll(async () => {
    redis = await startPublicAbuseRedis();
    server = createServer(async (incoming, outgoing) => {
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
        const url = new URL(incoming.url ?? "/", origin);
        const headers = new Headers();
        for (const [key, value] of Object.entries(incoming.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(",") : value);
        const request = new Request(url, { method: "POST", headers, body: Buffer.concat(chunks).toString() });
        const parts = url.pathname.split("/");
        const tenant = parts[4] ?? "";
        const params = { params: Promise.resolve({ tenant }) };
        const response = url.pathname === "/api/mcp/public" ? await mcp(request)
          : url.pathname.startsWith("/api/mcp/bookings/") ? await alias(request, params)
          : url.pathname.startsWith("/api/v1/leads/") ? await lead(request, params)
          : await reserve(request, params);
        outgoing.writeHead(response.status, Object.fromEntries(response.headers));
        outgoing.end(await response.text());
      } catch { outgoing.writeHead(500, { "content-type": "application/json" }); outgoing.end('{"error":"fixture transport failed"}'); }
    });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected loopback HTTP fixture");
    origin = `http://127.0.0.1:${address.port}`;
  });
  afterAll(async () => {
    if (server) await new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); });
    if (redis) await redis.stop();
    console.info("PUBLIC_ABUSE_METRICS", JSON.stringify(metrics));
    vi.unstubAllEnvs();
  });
  beforeEach(async () => {
    await redis.command("FLUSHDB"); run++;
    vi.clearAllMocks(); vi.stubEnv("STRELVA_AGENT_IDENTITY_LIMITS", "1");
    ports.redis.mockReturnValue(redis.client);
    ports.ready.mockResolvedValue(undefined);
    ports.services.mockResolvedValue({ services: [], timeZone: "UTC", paused: false });
    ports.hold.mockImplementation(async () => ({ booking: { id: "fixture", status: "held", start: "2026-12-03T15:00:00Z", end: "2026-12-03T15:30:00Z" }, statusToken: "fixture-token", confirmationRequired: true, created: true }));
    ports.updates.mockResolvedValue(undefined);
    ports.tenant.mockImplementation(async (id: string) => ({ id, stableId: id, active: true }));
    ports.capture.mockResolvedValue({ status: "captured", lead: { id: "fixture-lead" } });
  });

  it.each([OPENAI, CLAUDE])("admits 240 independent reads from shared provider %s", async ip => {
    const samples = await Promise.all(Array.from({ length: 240 }, (_, i) => read(`business-${i % 8}`, ip)));
    expect(samples.every(s => s.status === 200)).toBe(true); expect(ports.services).toHaveBeenCalledTimes(240);
    report(`shared-egress-reads:${ip}`, samples);
  });
  it("caps an ordinary IP at 120 reads even if the caller rotates business handles", async () => {
    const samples = await Promise.all(Array.from({ length: 180 }, (_, i) => read(`business-${i}`, "203.0.113.9")));
    expect(samples.filter(s => s.status === 200)).toHaveLength(AGENT_LIMITS.ip.max);
    expect(samples.filter(s => s.status === 429)).toHaveLength(60); expect(ports.services).toHaveBeenCalledTimes(120);
    report("ordinary-ip-read-burst", samples);
  });
  it("shares a business read ceiling across the platform MCP and its alias", async () => {
    const samples = await Promise.all(Array.from({ length: 640 }, (_, i) => read("one-business", undefined, i % 2 === 0)));
    expect(samples.filter(s => s.status === 200)).toHaveLength(AGENT_LIMITS.businessReads.max);
    expect(samples.filter(s => s.status === 429)).toHaveLength(40); expect(ports.services).toHaveBeenCalledTimes(600);
    report("platform-alias-shared-business", samples);
  });
  it("admits 40 customer holds from one shared provider, with confirmation still required", async () => {
    const samples = await Promise.all(Array.from({ length: 40 }, (_, i) => hold(`business-${i}`, i, OPENAI)));
    expect(samples.every(s => s.status === 200 && JSON.stringify(s.body).includes('"confirmationRequired":true'))).toBe(true);
    expect(ports.hold).toHaveBeenCalledTimes(40); report("shared-egress-distinct-holds", samples);
  });
  it("shares mailbox caps across REST and MCP, including Gmail and plus aliases", async () => {
    const emails = ["dana@gmail.com", "d.a.n.a+one@gmail.com", "Dana+two@googlemail.com", "dana+three@gmail.com", "dana+four@gmail.com", "dana+five@gmail.com", "dana+six@gmail.com", "dana+seven@gmail.com"];
    const samples = await Promise.all(emails.map((email, i) => hold(`business-${i}`, i, OPENAI, email, i % 2 ? "rest" : "mcp")));
    expect(samples.filter(s => s.status === 200 || s.status === 201)).toHaveLength(AGENT_LIMITS.emailHolds.max);
    expect(samples.filter(s => s.status === 429)).toHaveLength(3); expect(ports.hold).toHaveBeenCalledTimes(5);
    report("mailbox-cross-transport-alias-burst", samples);
  });
  it("holds the business ceiling under rotating emails, agents, addresses and transports", async () => {
    const samples = await Promise.all(Array.from({ length: 80 }, (_, i) => hold("one-business", i, `203.0.113.${i + 1}`, undefined, i % 2 ? "rest" : "mcp")));
    expect(samples.filter(s => s.status === 200 || s.status === 201)).toHaveLength(AGENT_LIMITS.businessHolds.max);
    expect(samples.filter(s => s.status === 429)).toHaveLength(50); expect(ports.hold).toHaveBeenCalledTimes(30);
    report("business-hold-rotation-burst", samples);
  });
  it("bounds the shared provider hold bucket and keeps the other provider independent", async () => {
    const samples = await Promise.all(Array.from({ length: 220 }, (_, i) => hold(`business-${i}`, i, OPENAI)));
    expect(samples.filter(s => s.status === 200)).toHaveLength(AGENT_LIMITS.egressHolds.max);
    expect(samples.filter(s => s.status === 429)).toHaveLength(20);
    expect((await hold("claude-business", 999, CLAUDE)).status).toBe(200);
    report("provider-hold-ceiling", samples);
  });
  it("preserves the legacy 20-request cap when identity limits are off", async () => {
    vi.stubEnv("STRELVA_AGENT_IDENTITY_LIMITS", "0");
    const samples = await Promise.all(Array.from({ length: 50 }, (_, i) => read(`business-${i}`, OPENAI)));
    expect(samples.filter(s => s.status === 200)).toHaveLength(20); expect(samples.filter(s => s.status === 429)).toHaveLength(30);
    report("flag-off-shared-egress", samples);
  });
  it("bounds unattributed traffic globally without one shared unknown-IP quota", async () => {
    const samples = await Promise.all(Array.from({ length: AGENT_LIMITS.global.max + 40 }, (_, i) => read(`business-${i}`)));
    expect(samples.filter(s => s.status === 200)).toHaveLength(AGENT_LIMITS.global.max);
    expect(samples.filter(s => s.status === 429)).toHaveLength(40);
    expect(ports.services).toHaveBeenCalledTimes(AGENT_LIMITS.global.max);
    expect(await redis.command("KEYS", "*unknown*")).toEqual([]);
    report("unattributed-global-read-ceiling", samples);
  });
  it("caps one declared agent even if every customer and business changes", async () => {
    const samples = await Promise.all(Array.from({ length: 140 }, (_, i) => hold(`business-${i}`, i, undefined, undefined, "mcp", i % 2 ? "Claude" : " claude ")));
    expect(samples.filter(s => s.status === 200)).toHaveLength(AGENT_LIMITS.agentHolds.max);
    expect(samples.filter(s => s.status === 429)).toHaveLength(20); expect(ports.hold).toHaveBeenCalledTimes(120);
    report("declared-agent-rotation-ceiling", samples);
  });
  it("refuses malformed MCP, oversized booking and honeypot lead bodies before delivery", async () => {
    const malformed = await send("/api/mcp/public", { jsonrpc: "2.0", id: 1, method: false });
    expect(malformed.status).toBe(400);
    const oversized = await send("/api/v1/bookings/fixture/reservations", { origin: "agent", padding: "x".repeat(31_000) });
    expect(oversized.status).toBe(400);
    const spam = await send("/api/v1/leads/fixture", { name: "Fixture Customer", website: "bot-filled-honeypot" });
    expect(spam.status).toBe(200); expect(spam.body).toEqual({ ok: true });
    expect(ports.spam).toHaveBeenCalledOnce(); expect(ports.capture).not.toHaveBeenCalled(); expect(ports.hold).not.toHaveBeenCalled(); expect(ports.updates).not.toHaveBeenCalled();
  });
  it("fails agent routes closed when the Redis transport fails, without creating or sending", async () => {
    ports.redis.mockReturnValue({ incr: async () => { throw new Error("fixture Redis outage"); } });
    const samples = await Promise.all(Array.from({ length: 40 }, (_, i) => hold(`business-${i}`, i, OPENAI, undefined, i % 2 ? "rest" : "mcp")));
    expect(samples.every(s => s.status === 503)).toBe(true); expect(ports.hold).not.toHaveBeenCalled(); expect(ports.updates).not.toHaveBeenCalled();
    report("agent-redis-outage", samples);
  });
  it("bounds lead capture under concurrency without crossing business quotas", async () => {
    const samples = await Promise.all(Array.from({ length: 80 }, (_, i) => send(`/api/v1/leads/lead-${run}`, { name: "Fixture Customer", email: `c${i}@example.test`, message: "Please tell me about your service." }, "203.0.113.8")));
    expect(samples.filter(s => s.status === 200)).toHaveLength(20); expect(samples.filter(s => s.status === 429)).toHaveLength(60); expect(ports.capture).toHaveBeenCalledTimes(20);
    expect((await send(`/api/v1/leads/other-${run}`, { name: "Fixture Customer" }, "203.0.113.8")).status).toBe(200);
    report("lead-burst", samples);
  });
  it("keeps lead intake bounded during a shared Redis outage", async () => {
    ports.redis.mockReturnValue({ incr: async () => { throw new Error("fixture Redis outage"); } });
    const samples = await Promise.all(Array.from({ length: 80 }, () => send(`/api/v1/leads/outage-${run}`, { name: "Fixture Customer" }, "203.0.113.8")));
    expect(samples.filter(s => s.status === 200)).toHaveLength(20); expect(samples.filter(s => s.status === 429)).toHaveLength(60); expect(ports.capture).toHaveBeenCalledTimes(20);
    report("lead-redis-outage", samples);
  });
  it("repairs a missing Redis TTL and never extends a live fixed window", async () => {
    await redis.command("SET", "reb:ratelimit:agent:v2:biz:ttl-business:read", 9);
    expect((await read("ttl-business")).status).toBe(200);
    const ttl = Number(await redis.command("PTTL", "reb:ratelimit:agent:v2:biz:ttl-business:read"));
    expect(ttl).toBeGreaterThan(0); expect(ttl).toBeLessThanOrEqual(60_000);
    await redis.command("PEXPIRE", "reb:ratelimit:agent:v2:biz:ttl-business:read", 20_000);
    await Promise.all(Array.from({ length: 40 }, () => read("ttl-business")));
    expect(Number(await redis.command("PTTL", "reb:ratelimit:agent:v2:biz:ttl-business:read"))).toBeLessThanOrEqual(20_000);
    const keys = await redis.command("KEYS", "reb:ratelimit:*");
    expect(Array.isArray(keys)).toBe(true);
    for (const key of keys as string[]) expect(Number(await redis.command("TTL", key))).toBeGreaterThanOrEqual(0);
  });
});
