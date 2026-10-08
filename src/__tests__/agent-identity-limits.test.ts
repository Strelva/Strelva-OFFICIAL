import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ports = vi.hoisted(() => ({ ipLimited: vi.fn(), windowed: vi.fn(), request: vi.fn(), updates: vi.fn() }));
vi.mock("@/platform/infra/rate-limit", () => ({
  isRateLimitedAsync: ports.ipLimited, isRateLimitedWindowedAsync: ports.windowed,
  rateLimitKey: (request: Request, prefix: string) => `${prefix}:${request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"}`,
}));
vi.mock("@/platform/bookings/native", async original => ({ ...await original<typeof import("@/platform/bookings/native")>(), requestAgentBooking: ports.request }));
vi.mock("@/platform/bookings/updates", () => ({ deliverBookingUpdates: ports.updates }));

import { AGENT_LIMITS, agentCallLimited, agentLimitBuckets, emailCapIdentity, isDisposableEmail, type AgentCall, type LimitCheck } from "@/platform/agent-channel/limits";
import { clientIp, egressProvider } from "@/platform/agent-channel/provider-egress";
import { PROVIDER_EGRESS } from "@/platform/agent-channel/provider-egress-data";
import { POST as reservations } from "@/app/api/v1/bookings/[tenant]/reservations/route";

const OPENAI_IP = "104.210.139.200"; // inside 104.210.139.192/28
const ANTHROPIC_IP = "160.79.107.9"; // inside 160.79.104.0/21
const req = (ip?: string) => new Request("http://localhost/api/mcp/public", { method: "POST", headers: ip ? { "x-forwarded-for": `${ip}, 10.0.0.1` } : {} });

/** An in-memory fixed-window counter with the same contract as the Redis limiter. */
function counter(): LimitCheck & { counts: Map<string, number> } {
  const counts = new Map<string, number>();
  const check: LimitCheck = async (key, max) => { const n = (counts.get(key) ?? 0) + 1; counts.set(key, n); return n > max; };
  return Object.assign(check, { counts });
}
const on = { STRELVA_AGENT_IDENTITY_LIMITS: "1" };
const hold = (business: string, email: string, extra: Partial<Extract<AgentCall, { kind: "hold" }>> = {}): AgentCall => ({ kind: "hold", business, email, agentName: "ChatGPT", requestId: `${business}-${email}`, ...extra });
async function holdsAllowed(check: LimitCheck, ip: string | undefined, calls: AgentCall[]) {
  let allowed = 0;
  for (const call of calls) if (!await agentCallLimited(req(ip), call, { legacyPrefix: "mcp-bookings:x", env: on, check })) allowed++;
  return allowed;
}

beforeEach(() => { vi.resetAllMocks(); ports.ipLimited.mockResolvedValue(false); ports.windowed.mockResolvedValue(false); ports.updates.mockResolvedValue(undefined); });
afterEach(() => vi.unstubAllEnvs());

describe("provider egress", () => {
  it("recognizes the checked-in OpenAI and Anthropic ranges without fetching them", () => {
    expect(PROVIDER_EGRESS.openai.ipv4).toHaveLength(283);
    expect(PROVIDER_EGRESS.openai.creationTime).toBe("2026-10-06T23:18:01.923622");
    expect(egressProvider(OPENAI_IP)).toBe("openai");
    expect(egressProvider("104.210.139.230")).toBe("openai");
    expect(egressProvider("104.210.139.208")).toBeNull(); // between the two /28s
    expect(egressProvider(ANTHROPIC_IP)).toBe("anthropic");
    expect(egressProvider(`::ffff:${ANTHROPIC_IP}`)).toBe("anthropic");
    for (const outside of ["160.79.112.1", "8.8.8.8", "2001:db8::1", "999.1.1.1", "", null]) expect(egressProvider(outside)).toBeNull();
  });

  it("reads only a well-formed first forwarded hop", () => {
    expect(clientIp(req("203.0.113.9"))).toBe("203.0.113.9");
    expect(clientIp(req())).toBeNull();
    expect(clientIp(new Request("http://localhost", { headers: { "x-forwarded-for": "not an ip" } }))).toBeNull();
  });
});

describe("identity-aware buckets", () => {
  it("adds no IP bucket when the address is missing, so unattributed calls never share one", () => {
    const keys = agentLimitBuckets({ kind: "read", business: "a" }, { ip: null }).map(b => b.key);
    expect(keys).toEqual(["agent:v2:all", "agent:v2:biz:a:read"]);
    expect(keys.join()).not.toContain("unknown");
  });

  it("counts provider egress as one shared provider bucket, not as a customer IP", () => {
    const keys = agentLimitBuckets(hold("a", "dana@example.test"), { ip: OPENAI_IP }).map(b => b.key);
    expect(keys).toContain("agent:v2:egress:openai");
    expect(keys).toContain("agent:v2:egress:openai:hold");
    expect(keys.some(k => k.includes(":ip:"))).toBe(false);
    expect(agentLimitBuckets(hold("a", "dana@example.test"), { ip: "203.0.113.9" }).some(b => b.key.startsWith("agent:v2:ip:"))).toBe(true);
  });

  it("caps holds by business, customer email, request, declared agent and globally, with no raw identity in keys", () => {
    const buckets = agentLimitBuckets(hold("a", " Dana@Example.test ", { requestId: "r-1" }), { ip: null });
    const keys = buckets.map(b => b.key);
    for (const prefix of ["agent:v2:all", "agent:v2:hold", "agent:v2:biz:a:hold", "agent:v2:email:", "agent:v2:request:a:", "agent:v2:agent:"]) expect(keys.some(k => k.startsWith(prefix))).toBe(true);
    expect(keys.join()).not.toMatch(/dana|example|chatgpt/i);
    expect(agentLimitBuckets(hold("a", "dana@example.test", { requestId: "r-1", agentName: " chatgpt" }), { ip: null }).map(b => b.key)).toEqual(keys);
    expect(buckets.find(b => b.key === "agent:v2:biz:a:hold")).toMatchObject(AGENT_LIMITS.businessHolds);
  });

  it("bounds status reads per token and per business", () => {
    const keys = agentLimitBuckets({ kind: "status", business: "a", statusToken: "t".repeat(43) }, { ip: null }).map(b => b.key);
    expect(keys).toEqual(["agent:v2:all", "agent:v2:biz:a:status", expect.stringMatching(/^agent:v2:status:[0-9a-f]{32}$/)]);
  });
});

describe("agentCallLimited", () => {
  it("keeps the shipped 20-a-minute business+IP limit while the flag is off", async () => {
    await agentCallLimited(req("203.0.113.9"), { kind: "read", business: "a" }, { legacyPrefix: "mcp-bookings:a", env: {} });
    expect(ports.ipLimited).toHaveBeenCalledWith("mcp-bookings:a:203.0.113.9", 20);
    expect(ports.windowed).not.toHaveBeenCalled();
  });

  it("lets many customers book through one provider address where the old IP limit refused the 21st call", async () => {
    const check = counter();
    const calls = Array.from({ length: 40 }, (_, i) => hold(`biz-${i % 20}`, `customer-${i}@example.test`, { agentName: `assistant ${i}` }));
    expect(await holdsAllowed(check, OPENAI_IP, calls)).toBe(40);
    // A single ordinary address is still a customer-sized bucket.
    expect(await holdsAllowed(counter(), "203.0.113.9", calls)).toBe(AGENT_LIMITS.ipHolds.max);
  });

  it("refuses a customer email past its cap across businesses, whatever the address", async () => {
    const check = counter();
    const calls = Array.from({ length: 8 }, (_, i) => hold(`biz-${i}`, "same@example.test", { requestId: `r-${i}`, agentName: `a${i}` }));
    expect(await holdsAllowed(check, OPENAI_IP, calls)).toBe(AGENT_LIMITS.emailHolds.max);
    expect(await holdsAllowed(counter(), undefined, calls.slice(0, 4).map(c => ({ ...c, business: "one" })))).toBe(AGENT_LIMITS.emailBusinessHolds.max);
  });

  it("counts plus-tag and Gmail dot aliases as one mailbox (#547 review)", async () => {
    const aliases = ["dana@gmail.com", "dana+0@gmail.com", "d.a.n.a@gmail.com", "Dana+x@GoogleMail.com", "dana+1@gmail.com"];
    const calls = aliases.map((email, i) => hold("one", email, { requestId: `alias-${i}`, agentName: `a${i}` }));
    expect(await holdsAllowed(counter(), undefined, calls)).toBe(AGENT_LIMITS.emailBusinessHolds.max);
    expect(emailCapIdentity("D.Ana+Tag@googlemail.com")).toBe("dana@gmail.com");
    expect(emailCapIdentity("first.last+x@example.test")).toBe("first.last@example.test");
  });

  it("caps one business's holds even when every request uses a new email and address", async () => {
    const check = counter();
    const calls = Array.from({ length: 40 }, (_, i) => hold("busy", `c${i}@example.test`, { agentName: `a${i}` }));
    expect(await holdsAllowed(check, undefined, calls)).toBe(AGENT_LIMITS.businessHolds.max);
  });

  it("never lifts a cap for a declared agent name: one name is one bucket", async () => {
    const check = counter();
    const calls = Array.from({ length: AGENT_LIMITS.agentHolds.max + 5 }, (_, i) => hold(`b${i}`, `c${i}@example.test`, { agentName: i % 2 ? "Claude" : " claude " }));
    expect(await holdsAllowed(check, undefined, calls)).toBe(AGENT_LIMITS.agentHolds.max);
  });

  it("keeps different businesses' reads apart when no address is forwarded", async () => {
    const check = counter();
    for (let i = 0; i < AGENT_LIMITS.businessReads.max; i++) await agentCallLimited(req(), { kind: "read", business: "a" }, { legacyPrefix: "x", env: on, check });
    expect(await agentCallLimited(req(), { kind: "read", business: "a" }, { legacyPrefix: "x", env: on, check })).toBe(true);
    expect(await agentCallLimited(req(), { kind: "read", business: "b" }, { legacyPrefix: "x", env: on, check })).toBe(false);
  });

  it("applies the global safety cap to everything", async () => {
    const check = counter();
    check.counts.set("agent:v2:all", AGENT_LIMITS.global.max);
    expect(await agentCallLimited(req(), { kind: "read", business: "fresh" }, { legacyPrefix: "x", env: on, check })).toBe(true);
  });

  it("blocks throwaway inboxes as confirmation addresses", () => {
    expect(isDisposableEmail("x@mailinator.com")).toBe(true);
    expect(isDisposableEmail("X@Sub.Yopmail.com")).toBe(true);
    expect(isDisposableEmail("dana@gmail.com")).toBe(false);
  });
});

describe("v1 agent reservations", () => {
  const params = { params: Promise.resolve({ tenant: "fixture" }) };
  const send = (body: Record<string, unknown>, ip = OPENAI_IP) => reservations(new Request("http://localhost/api/v1/bookings/fixture/reservations", {
    method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body),
  }), params);
  const agent = { origin: "agent", serviceId: "svc", start: "2026-11-03T15:00:00Z", requestId: "request_123", agent: { name: "Assistant" }, customer: { name: "Dana", email: "dana@example.test" } };

  it("counts agent holds by identity instead of the per-IP limit when the flag is on", async () => {
    vi.stubEnv("STRELVA_AGENT_IDENTITY_LIMITS", "1");
    ports.request.mockResolvedValue({ booking: { id: "b1", status: "held", start: "s", end: "e" }, statusToken: "status", confirmationRequired: true, created: true });
    expect((await send(agent)).status).toBe(201);
    expect(ports.ipLimited).not.toHaveBeenCalled();
    expect(ports.windowed.mock.calls.map(c => c[0])).toEqual(expect.arrayContaining(["agent:v2:egress:openai:hold", "agent:v2:biz:fixture:hold"]));
    ports.windowed.mockResolvedValueOnce(true);
    expect((await send(agent)).status).toBe(429);
    const blocked = await send({ ...agent, customer: { name: "Dana", email: "dana@mailinator.com" } });
    expect(blocked.status).toBe(400);
    expect(ports.request).toHaveBeenCalledTimes(1);
  });

  it("leaves visitor bookings and flag-off agent holds on the shipped IP limit", async () => {
    ports.ipLimited.mockResolvedValue(true);
    expect((await send(agent)).status).toBe(429);
    expect(ports.ipLimited).toHaveBeenCalledWith(`v1-bookings:fixture:${OPENAI_IP}`, 20);
    vi.stubEnv("STRELVA_AGENT_IDENTITY_LIMITS", "1");
    expect((await send({ capabilityId: "c", capabilityVersion: 1, slotId: "s", visitor: { name: "Dana", email: "d@example.test" } })).status).toBe(429);
    expect(ports.windowed).not.toHaveBeenCalled();
  });
});
