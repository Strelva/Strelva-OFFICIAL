import { beforeEach, describe, expect, it, vi } from "vitest";

const ports = vi.hoisted(() => ({
  enabled: vi.fn(), limited: vi.fn(), services: vi.fn(), slots: vi.fn(), request: vi.fn(), lookup: vi.fn(),
  verification: vi.fn(), confirmable: vi.fn(), updates: vi.fn(), context: vi.fn(), rpc: vi.fn(), directory: vi.fn(), scope: vi.fn(),
}));
vi.mock("@/platform/bookings/native", async original => ({
  ...await original<typeof import("@/platform/bookings/native")>(),
  requireAgentBookings: ports.enabled, nativeServices: ports.services, nativeSlots: ports.slots,
  requestAgentBooking: ports.request, nativeBookingByToken: ports.lookup, agentConfirmationAvailable: ports.confirmable,
}));
vi.mock("@/platform/bookings/updates", () => ({ deliverBookingUpdates: ports.updates }));
vi.mock("@/platform/bookings/store", async original => ({
  ...await original<typeof import("@/platform/bookings/store")>(),
  readBookingContext: ports.context, bookingStoreDb: () => ({ rpc: ports.rpc }),
}));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedAsync: ports.limited, isRateLimitedWindowedAsync: ports.limited, rateLimitKey: (_r: Request, prefix: string) => `${prefix}:ip` }));
vi.mock("@/app/api/mcp/_directory", () => ({ tenantDirectory: { list: ports.directory, scope: ports.scope, verification: ports.verification } }));

import { DELETE, GET, POST as platform } from "@/app/api/mcp/public/route";
import { POST as alias } from "@/app/api/mcp/bookings/[tenant]/route";
import { BUSINESS_TOOLS, PLATFORM_TOOLS } from "@/platform/agent-channel/public-tools";
import { SUPPORTED_VERSIONS } from "@/platform/agent-channel/protocol";
import { tokenHash } from "@/platform/bookings/native";

const MODERN = "2026-07-28";
const meta = (version = MODERN, client = "fixture-client") => ({
  "io.modelcontextprotocol/protocolVersion": version,
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: client, version: "1.0.0" },
});
type Params = Record<string, unknown>;
const url = (business?: string) => business ? `http://localhost/api/mcp/bookings/${business}` : "http://localhost/api/mcp/public";
function post(target: string | undefined, body: unknown, headers: Record<string, string>) {
  const request = new Request(url(target), { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers }, body: JSON.stringify(body) });
  return target ? alias(request, { params: Promise.resolve({ tenant: target }) }) : platform(request);
}
/** A conforming 2026-07-28 request: body _meta mirrored by the three headers. */
function modern(method: string, params: Params = {}, options: { headers?: Record<string, string>; business?: string; id?: string | null; meta?: unknown } = {}) {
  const headers: Record<string, string> = { "mcp-protocol-version": MODERN, "mcp-method": method, ...(method === "tools/call" ? { "mcp-name": String(params.name) } : {}) };
  const body = { jsonrpc: "2.0", ...(options.id === null ? {} : { id: options.id ?? "req-1" }), method, params: { ...params, _meta: options.meta === undefined ? meta() : options.meta } };
  return post(options.business, body, { ...headers, ...options.headers });
}
function legacy(method: string, params: Params = {}, options: { version?: string | null; business?: string; id?: string | null } = {}) {
  const version = options.version === undefined ? "2025-11-25" : options.version;
  return post(options.business, { jsonrpc: "2.0", ...(options.id === null ? {} : { id: options.id ?? "req-1" }), method, params }, version ? { "mcp-protocol-version": version } : {});
}
const tool = (name: string, args: Params, options: { business?: string } = {}) => modern("tools/call", { name, arguments: args }, options);

const NATIVE_WORKSPACE = "7c470000-0000-4000-8000-000000000001";
const LATER = new Date(Date.now() + 86_400_000).toISOString();
const fixtureContext = { workspaceId: "ws", paused: false, phone: "716-555-0100", services: [{ id: "svc", name: "Consult", active: true, durationMinutes: 30, externalRef: null }], settings: null, hours: null, tenantStableId: "stable", systemId: null };

beforeEach(() => {
  vi.resetAllMocks();
  ports.verification.mockResolvedValue(undefined);
  ports.enabled.mockResolvedValue(undefined); ports.limited.mockResolvedValue(false); ports.updates.mockResolvedValue(undefined);
  ports.confirmable.mockResolvedValue(true); ports.context.mockResolvedValue(fixtureContext);
  ports.rpc.mockResolvedValue({ data: { name: "Fixture Barbers", address: "1 Main St, Buffalo" }, error: null });
  ports.directory.mockResolvedValue([
    { business: "fixture", name: "Fixture Barbers", industry: "barber", website: "https://fixture.example" },
    { business: "elmwood-dental", name: "Elmwood Dental", industry: "dentist", website: "https://elmwood.example" },
    { business: "closed-shop", name: "Closed Barbers", industry: "barber", website: null },
    { business: "biz:native-cuts", name: "Native Cuts", industry: null, website: "https://app.strelva.test/biz/native-cuts" },
  ]);
  ports.scope.mockImplementation(async (business: string) => business.startsWith("biz:")
    ? business === "biz:native-cuts" ? `workspace:${NATIVE_WORKSPACE}` : null
    : business);
});

describe("modern MCP 2026-07-28", () => {
  it("implements server/discover with versions, capabilities and server identity", async () => {
    const response = await modern("server/discover");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).result).toEqual({
      resultType: "complete", supportedVersions: SUPPORTED_VERSIONS, capabilities: { tools: { listChanged: false } },
      instructions: expect.stringContaining("search_business"), ttlMs: 3600000, cacheScope: "public",
      _meta: { "io.modelcontextprotocol/serverInfo": { name: "strelva", version: "1.0.0" } },
    });
    expect(SUPPORTED_VERSIONS).toEqual(["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26"]);
  });

  it("requires protocolVersion and clientCapabilities in _meta on every request (-32602, 400)", async () => {
    const noVersion = await modern("tools/list", {}, { meta: { "io.modelcontextprotocol/clientCapabilities": {} } });
    expect(noVersion.status).toBe(400);
    expect((await noVersion.json()).error.code).toBe(-32602);
    const noCapabilities = await modern("tools/list", {}, { meta: { "io.modelcontextprotocol/protocolVersion": MODERN } });
    expect(noCapabilities.status).toBe(400);
    expect((await noCapabilities.json()).error.code).toBe(-32602);
    const noMeta = await post(undefined, { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }, { "mcp-protocol-version": MODERN, "mcp-method": "tools/list" });
    expect(noMeta.status).toBe(400);
    expect((await noMeta.json()).error.code).toBe(-32602);
    expect(ports.limited).not.toHaveBeenCalled();
  });

  it("rejects missing or mismatched mirrored headers with HeaderMismatch (-32020, 400)", async () => {
    const cases = [
      modern("tools/list", {}, { headers: { "mcp-method": "tools/call" } }),
      post(undefined, { jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: meta() } }, { "mcp-protocol-version": MODERN }),
      modern("tools/call", { name: "list_services", arguments: { business: "fixture" } }, { headers: { "mcp-name": "find_slots" } }),
      post(undefined, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_services", _meta: meta() } }, { "mcp-protocol-version": MODERN, "mcp-method": "tools/call" }),
      // A modern body without the version header, and a body/header version disagreement.
      post(undefined, { jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: meta() } }, { "mcp-method": "tools/list" }),
      modern("tools/list", {}, { meta: meta("2025-11-25") }),
    ];
    for (const response of await Promise.all(cases)) {
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe(-32020);
    }
    expect(ports.services).not.toHaveBeenCalled();
  });

  it("decodes a Base64-sentinel Mcp-Name before comparing it to the body", async () => {
    ports.services.mockResolvedValue({ services: [], timeZone: "UTC", paused: false });
    const encoded = `=?base64?${Buffer.from("list_services").toString("base64")}?=`;
    const body = await (await modern("tools/call", { name: "list_services", arguments: { business: "fixture" } }, { headers: { "mcp-name": encoded } })).json();
    expect(body.result).toMatchObject({ resultType: "complete", isError: false });
  });

  it("rejects unsupported versions with -32022 listing supported and requested", async () => {
    for (const response of [await modern("tools/list", {}, { headers: { "mcp-protocol-version": "1900-01-01" }, meta: meta("1900-01-01") }), await legacy("initialize", {}, { version: "future" })]) {
      expect(response.status).toBe(400);
      const { error } = await response.json();
      expect(error.code).toBe(-32022);
      expect(error.data.supported).toEqual(SUPPORTED_VERSIONS);
      expect(["1900-01-01", "future"]).toContain(error.data.requested);
    }
  });

  it("has no initialize, ping or GET/DELETE stream in the modern era", async () => {
    for (const method of ["initialize", "ping", "resources/list"]) {
      const response = await modern(method);
      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe(-32601);
    }
    expect((await GET()).status).toBe(405);
    expect((await DELETE()).status).toBe(405);
    expect((await modern("notifications/cancelled", {}, { id: null })).status).toBe(202);
  });

  it("validates Origin and content type before anything else", async () => {
    expect((await modern("server/discover", {}, { headers: { origin: "https://evil.example" } })).status).toBe(403);
    expect((await modern("server/discover", {}, { headers: { origin: "http://localhost" } })).status).toBe(200);
    expect((await modern("server/discover", {}, { headers: { "content-type": "text/plain" } })).status).toBe(415);
    expect(ports.enabled).toHaveBeenCalledTimes(1);
  });

  it("answers flags-off and throttled calls with modern app errors before any operation", async () => {
    ports.enabled.mockRejectedValue(new Error("flag off"));
    const off = await tool("list_services", { business: "fixture" });
    expect(off.status).toBe(503);
    expect((await off.json()).error.code).toBe(-31003);
    expect(ports.limited).not.toHaveBeenCalled();
    ports.verification.mockResolvedValue(undefined);
  ports.enabled.mockResolvedValue(undefined); ports.limited.mockResolvedValue(true);
    const throttled = await tool("list_services", { business: "fixture" });
    expect(throttled.status).toBe(429);
    expect((await throttled.json()).error.code).toBe(-31029);
    expect(ports.services).not.toHaveBeenCalled();
  });
});

describe("deterministic tool catalog", () => {
  it("returns the same cacheable list regardless of client identity, history or era", async () => {
    const first = await (await modern("tools/list")).json();
    await tool("search_business", { query: "barber" });
    const second = await (await modern("tools/list", {}, { meta: meta(MODERN, "another-client") })).json();
    expect(second).toEqual(first);
    expect(first.result).toMatchObject({ resultType: "complete", ttlMs: 3600000, cacheScope: "public" });
    const old = await (await legacy("tools/list")).json();
    expect(old.result).toEqual({ tools: first.result.tools });
    expect(first.result.tools.map((t: { name: string }) => t.name)).toEqual(["search_business", "get_business", "list_services", "find_slots", "request_booking", "get_booking_status"]);
  });

  it("titles and annotates every tool, keeping reads and the one write separate", () => {
    for (const t of [...PLATFORM_TOOLS, ...BUSINESS_TOOLS]) {
      expect(t.title.length).toBeGreaterThan(3);
      expect(t.annotations.readOnlyHint).toBe(t.name !== "request_booking");
      if (t.name === "request_booking") expect(t.annotations).toMatchObject({ destructiveHint: true, idempotentHint: true, openWorldHint: true });
    }
    expect(Object.isFrozen(PLATFORM_TOOLS)).toBe(true);
  });

  it("serves the alias the same booking tools with the business fixed by the URL", () => {
    const platformBooking = PLATFORM_TOOLS.slice(2).map(t => {
      const input = t.inputSchema as { properties: Record<string, unknown>; required: string[] };
      const { business, ...properties } = input.properties;
      expect(business).toMatchObject({ type: "string" });
      return { ...t, inputSchema: { ...input, properties, required: input.required.filter(r => r !== "business") } };
    });
    expect(platformBooking).toEqual(BUSINESS_TOOLS);
  });
});

describe("legacy era (2025-03-26, 2025-06-18, 2025-11-25)", () => {
  it("negotiates each legacy version through initialize, with or without the header", async () => {
    for (const version of ["2025-03-26", "2025-06-18", "2025-11-25"]) {
      expect((await (await legacy("initialize", { protocolVersion: version }, { version: version === "2025-03-26" ? null : version })).json()).result).toMatchObject({
        protocolVersion: version, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "strelva" },
      });
    }
    expect((await (await legacy("initialize", { protocolVersion: MODERN })).json()).result.protocolVersion).toBe("2025-11-25");
    expect((await (await legacy("ping")).json()).result).toEqual({});
    expect((await legacy("notifications/initialized", {}, { id: null })).status).toBe(202);
  });

  it("keeps legacy results free of modern fields and legacy error codes", async () => {
    ports.services.mockResolvedValue({ services: [], timeZone: "UTC", paused: false });
    const body = await (await legacy("tools/call", { name: "list_services", arguments: { business: "fixture" } })).json();
    expect(body.result).not.toHaveProperty("resultType");
    expect(body.result).toMatchObject({ isError: false, structuredContent: { services: [] } });
    expect((await (await legacy("server/discover")).json()).error.code).toBe(-32601);
    ports.limited.mockResolvedValue(true);
    expect((await (await legacy("tools/list")).json()).error.code).toBe(-32000);
  });
});

describe("platform tools", () => {
  it("finds only businesses whose assistant requests can be confirmed, in a stable order", async () => {
    ports.context.mockImplementation(async (business: string) => business === "closed-shop" ? { ...fixtureContext, paused: true } : fixtureContext);
    const body = await (await tool("search_business", { query: "Barbers" })).json();
    expect(body.result.structuredContent).toEqual({ businesses: [{ business: "fixture", name: "Fixture Barbers", industry: "barber", website: "https://fixture.example" }] });
    ports.confirmable.mockResolvedValue(false);
    expect((await (await tool("search_business", { query: "dental" })).json()).result.structuredContent).toEqual({ businesses: [] });
    expect((await (await tool("search_business", { query: "x" })).json()).result.isError).toBe(true);
  });

  it("reads public business facts by handle", async () => {
    ports.services.mockResolvedValue({ services: [{ id: "svc" }], timeZone: "America/New_York", paused: false });
    const body = await (await tool("get_business", { business: "fixture" })).json();
    expect(body.result.structuredContent).toEqual({
      business: "fixture", name: "Fixture Barbers", industry: "barber", website: "https://fixture.example", address: "1 Main St, Buffalo",
      phone: "716-555-0100", timeZone: "America/New_York", paused: false, acceptsBookingRequests: true, serviceCount: 1,
      verification: { domains: [], googleBusinessProfile: { linked: null, verified: null, checkedAt: null, stale: true }, ownerConfirmedFactCount: null, lastConfirmedAt: null, operatingAgency: null },
    });
    expect(ports.rpc).toHaveBeenCalledWith("read_booking_business_details", { p_tenant_id: "fixture" });
    expect((await (await tool("get_business", { business: "not-listed" })).json()).result).toMatchObject({ isError: true, content: [{ text: "This business is unavailable." }] });
  });

  it("returns the public verification block, and loses claims when its reader fails", async () => {
    ports.services.mockResolvedValue({ services: [{ id: "svc" }], timeZone: "America/New_York", paused: false });
    const verification = { domains: [], googleBusinessProfile: { linked: true, verified: null, checkedAt: "2026-10-08T10:00:00Z", stale: false }, ownerConfirmedFactCount: 3, lastConfirmedAt: "2026-10-08T10:00:00Z", operatingAgency: { name: "Fictional Agency" } };
    ports.verification.mockResolvedValueOnce(verification);
    expect((await (await tool("get_business", { business: "fixture" })).json()).result.structuredContent.verification).toEqual(verification);
    ports.verification.mockRejectedValueOnce(new Error("PRIVATE"));
    const result = (await (await tool("get_business", { business: "fixture" })).json()).result.structuredContent;
    expect(result.verification.ownerConfirmedFactCount).toBeNull();
    expect(result.verification.googleBusinessProfile.verified).toBeNull();
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });

  it("requires a valid business handle on every business tool", async () => {
    for (const args of [{}, { business: "../other" }, { business: "UPPER" }]) {
      const body = await (await tool("list_services", args)).json();
      expect(body.result).toMatchObject({ isError: true, content: [{ text: "Choose a business handle from search_business." }] });
    }
    expect(ports.services).not.toHaveBeenCalled();
    expect((await (await tool("confirm_booking", { business: "fixture" })).json()).error.code).toBe(-32602);
  });

  it("refuses a status token issued for another business", async () => {
    ports.lookup.mockResolvedValue({ id: "b1", tenantId: "other", workspaceId: null, status: "held", start: "s", end: LATER });
    const body = await (await tool("get_booking_status", { business: "fixture", statusToken: "s".repeat(43) })).json();
    expect(body.result.isError).toBe(true);
    expect(ports.lookup).toHaveBeenCalledWith(tokenHash("s".repeat(43)), "status");
  });
});

describe("#547 review regressions", () => {
  /** A real fixed-window counter in place of Redis, keyed exactly as called. */
  function countingLimiter() {
    const counts = new Map<string, number>();
    ports.limited.mockImplementation(async (key: string, max: number) => {
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return counts.get(key)! > max;
    });
    return counts;
  }

  it("keys the flag-off limiter on the caller, so rotating an unused business argument cannot reset it", async () => {
    const counts = countingLimiter();
    for (let n = 0; n < 20; n += 1) expect((await tool("search_business", { query: "barber" })).status).toBe(200);
    expect((await tool("search_business", { query: "barber" })).status).toBe(429);
    for (let n = 0; n < 25; n += 1) expect((await tool("search_business", { query: "barber", business: `unused-${n}` })).status).toBe(429);
    expect([...counts.keys()]).toEqual(["mcp-public:ip"]);
  });

  it("keeps directory calls out of business buckets with identity limits on", async () => {
    vi.stubEnv("STRELVA_AGENT_IDENTITY_LIMITS", "1");
    try {
      const counts = countingLimiter();
      await modern("tools/call", { name: "search_business", arguments: { query: "barber", business: "unused-1" } }, { headers: { "x-forwarded-for": "203.0.113.9" } });
      expect(counts.size).toBeGreaterThan(0);
      expect([...counts.keys()].some(key => key.includes("biz:"))).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("refuses arguments a tool does not declare", async () => {
    const body = await (await tool("search_business", { query: "barber", business: "fixture" })).json();
    expect(body.result).toMatchObject({ isError: true });
    expect(ports.directory).not.toHaveBeenCalled();
    const alias = await (await tool("list_services", { extra: true }, { business: "fixture" })).json();
    expect(alias.result).toMatchObject({ isError: true });
    expect(ports.services).not.toHaveBeenCalled();
  });

  it("rejects a malformed Base64 Mcp-Name with HeaderMismatch (-32020)", async () => {
    for (const header of ["=?base64?bGlzdF9zZXJ2aWNlcw==junk?=", "=?base64?bGlzdF9zZXJ2aWNlcw?=", "=?base64?bGlzdF9zZXJ2aWNlcw=?=", "=?base64?/w==?="]) {
      const response = await modern("tools/call", { name: "list_services", arguments: { business: "fixture" } }, { headers: { "mcp-name": header } });
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe(-32020);
    }
    expect(ports.services).not.toHaveBeenCalled();
  });

  it("stops answering a status token a day after the booking ends", async () => {
    const ended = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
    ports.lookup.mockResolvedValue({ id: "b1", tenantId: "fixture", workspaceId: null, status: "confirmed", start: ended(26), end: ended(25) });
    expect((await (await tool("get_booking_status", { business: "fixture", statusToken: "s".repeat(43) })).json()).result)
      .toMatchObject({ isError: true, content: [{ text: "Booking not found." }] });
    const recent = { id: "b1", tenantId: "fixture", workspaceId: null, status: "confirmed", start: ended(2), end: ended(1) };
    ports.lookup.mockResolvedValue(recent);
    expect((await (await tool("get_booking_status", { business: "fixture", statusToken: "s".repeat(43) })).json()).result.structuredContent)
      .toEqual({ reservationId: "b1", status: "confirmed", start: recent.start, end: recent.end });
  });

  it("lists and books businesses without a website through their published /biz handle", async () => {
    const scope = `workspace:${NATIVE_WORKSPACE}`;
    const found = await (await tool("search_business", { query: "native" })).json();
    expect(found.result.structuredContent.businesses).toEqual([{ business: "biz:native-cuts", name: "Native Cuts", industry: null, website: "https://app.strelva.test/biz/native-cuts" }]);
    expect(ports.context).toHaveBeenCalledWith(scope);
    ports.services.mockResolvedValue({ services: [], timeZone: "UTC", paused: false });
    expect((await (await tool("list_services", { business: "biz:native-cuts" })).json()).result.isError).toBe(false);
    expect(ports.services).toHaveBeenCalledWith(scope);
    ports.request.mockResolvedValue({ booking: { id: "b2", status: "held", start: "s", end: LATER }, statusToken: "status-only", confirmationRequired: true });
    const booking = { serviceId: "cut", start: "2026-11-03T15:00:00Z", requestId: "native-123", agent: { name: "Assistant" }, customer: { name: "Dana", email: "dana@example.test" } };
    await tool("request_booking", { business: "biz:native-cuts", ...booking });
    expect(ports.request).toHaveBeenCalledWith(scope, { ...booking, origin: "agent" });
    ports.lookup.mockResolvedValue({ id: "b2", tenantId: null, workspaceId: NATIVE_WORKSPACE, status: "held", start: "s", end: LATER });
    expect((await (await tool("get_booking_status", { business: "biz:native-cuts", statusToken: "s".repeat(43) })).json()).result.isError).toBe(false);
    expect((await (await tool("get_booking_status", { business: "fixture", statusToken: "s".repeat(43) })).json()).result.isError).toBe(true);
    // Unpublished handles and raw workspace scopes never reach native services.
    vi.clearAllMocks();
    expect((await (await tool("list_services", { business: "biz:unpublished" })).json()).result).toMatchObject({ isError: true, content: [{ text: "This business is unavailable." }] });
    expect((await (await tool("list_services", { business: scope })).json()).result).toMatchObject({ isError: true, content: [{ text: "Choose a business handle from search_business." }] });
    expect(ports.services).not.toHaveBeenCalled();
  });
});

describe("per-business alias delegates to the platform server", () => {
  const booking = { serviceId: "consult", start: "2026-11-03T15:00:00Z", requestId: "retry-123", agent: { name: "Assistant" }, customer: { name: "Dana", email: "dana@example.test" } };
  const cases: Array<[string, Params]> = [
    ["list_services", {}],
    ["find_slots", { serviceId: "consult", from: "2026-11-01", to: "2026-11-02" }],
    ["request_booking", booking],
    ["get_booking_status", { statusToken: "t".repeat(43) }],
  ];

  it.each(cases)("%s: same native call and same result on both endpoints, in both eras", async (name, args) => {
    ports.services.mockResolvedValue({ services: [], timeZone: "UTC", paused: false });
    ports.slots.mockResolvedValue({ slots: [], timeZone: "UTC", paused: false, version: 1 });
    ports.request.mockResolvedValue({ booking: { id: "b1", status: "held", start: "s", end: "e" }, statusToken: "status-only", confirmationRequired: true });
    ports.lookup.mockResolvedValue({ id: "b1", tenantId: "fixture", workspaceId: null, status: "held", start: "s", end: LATER, customer: { email: "private@example.test" } });
    const results = [];
    const calls = [];
    for (const send of [
      () => tool(name, { business: "fixture", ...args }),
      () => tool(name, args, { business: "fixture" }),
      () => legacy("tools/call", { name, arguments: args }, { business: "fixture" }),
    ]) {
      vi.clearAllMocks();
      const body = await (await send()).json();
      results.push(body.result.structuredContent);
      calls.push([ports.services, ports.slots, ports.request, ports.lookup].map(port => port.mock.calls));
      expect(ports.limited).toHaveBeenCalledWith(results.length === 1 ? "mcp-public:ip" : "mcp-bookings:fixture:ip", 20);
    }
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
    expect(calls[1]).toEqual(calls[0]);
    expect(calls[2]).toEqual(calls[0]);
    if (name === "request_booking") expect(ports.request).toHaveBeenCalledWith("fixture", { ...booking, origin: "agent" });
    if (name === "get_booking_status") expect(results[0]).toEqual({ reservationId: "b1", status: "held", start: "s", end: LATER });
  });

  it("speaks the modern era on the alias too, without directory tools", async () => {
    const list = await (await modern("tools/list", {}, { business: "fixture" })).json();
    expect(list.result.tools.map((t: { name: string }) => t.name)).toEqual(["list_services", "find_slots", "request_booking", "get_booking_status"]);
    expect((await (await tool("search_business", { query: "barber" }, { business: "fixture" })).json()).error.code).toBe(-32602);
    expect((await (await modern("server/discover", {}, { business: "fixture" })).json()).result._meta["io.modelcontextprotocol/serverInfo"].name).toBe("strelva-bookings");
  });
});
