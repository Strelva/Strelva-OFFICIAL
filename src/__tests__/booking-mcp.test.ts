import { beforeEach, describe, expect, it, vi } from "vitest";

const ports = vi.hoisted(() => ({
  enabled: vi.fn(), limited: vi.fn(), services: vi.fn(), slots: vi.fn(), request: vi.fn(),
  lookup: vi.fn(), updates: vi.fn(),
}));
vi.mock("@/platform/bookings/native", async original => ({
  ...await original<typeof import("@/platform/bookings/native")>(),
  requireAgentBookings: ports.enabled, nativeServices: ports.services, nativeSlots: ports.slots,
  requestAgentBooking: ports.request, nativeBookingByToken: ports.lookup,
}));
vi.mock("@/platform/bookings/updates", () => ({ deliverBookingUpdates: ports.updates }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedAsync: ports.limited, rateLimitKey: () => "mcp-fixture" }));

import { GET, POST } from "@/app/api/mcp/bookings/[tenant]/route";
import { PublicBookingError } from "@/products/scheduling/server";
import { tokenHash } from "@/platform/bookings/native";

const tenant = { params: Promise.resolve({ tenant: "fixture" }) };
function call(method: string, params: unknown = {}, headers: Record<string, string> = {}, id: string | null = "req-1") {
  return POST(new Request("http://localhost/api/mcp/bookings/fixture", {
    method: "POST", headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", ...(id ? { id } : {}), method, params }),
  }), tenant);
}

beforeEach(() => {
  vi.resetAllMocks();
  ports.enabled.mockResolvedValue(undefined); ports.limited.mockResolvedValue(false);
  ports.updates.mockResolvedValue(undefined);
});

describe("bounded booking MCP transport", () => {
  it("negotiates supported versions and advertises only the four booking tools", async () => {
    for (const version of ["2025-03-26", "2025-06-18", "2025-11-25"]) {
      expect(await (await call("initialize", { protocolVersion: version })).json()).toMatchObject({
        jsonrpc: "2.0", id: "req-1", result: { protocolVersion: version, capabilities: { tools: { listChanged: false } } },
      });
    }
    const response = await call("tools/list");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.result.tools.map((tool: { name: string }) => tool.name)).toEqual(["list_services", "find_slots", "request_booking", "get_booking_status"]);
    expect(body.result.tools[2].description).toContain("Only the customer email can confirm");
    expect(ports.request).not.toHaveBeenCalled();
  });

  it("routes service and slot reads to the same tenant-bound native operations", async () => {
    ports.services.mockResolvedValue({ services: [], timeZone: "UTC", paused: false });
    ports.slots.mockResolvedValue({ slots: [], timeZone: "UTC", paused: false });
    expect((await (await call("tools/call", { name: "list_services" })).json()).result.structuredContent).toMatchObject({ services: [] });
    await call("tools/call", { name: "find_slots", arguments: { serviceId: "consult", from: "2026-11-01", to: "2026-11-02" } });
    expect(ports.services).toHaveBeenCalledWith("fixture");
    expect(ports.slots).toHaveBeenCalledWith("fixture", "consult", "2026-11-01", "2026-11-02");
  });

  it("returns a held receipt with only the status credential even if email read-back fails", async () => {
    ports.request.mockResolvedValue({ booking: { id: "b1", status: "held", start: "start", end: "end" }, statusToken: "status-only", confirmationRequired: true });
    ports.updates.mockRejectedValue(new Error("read-back failed"));
    const args = { serviceId: "consult", start: "start", requestId: "retry-1", customer: { name: "Dana", email: "dana@example.test" }, agent: { name: "Assistant" } };
    // A caller cannot pick its own origin: undeclared arguments are refused.
    expect((await (await call("tools/call", { name: "request_booking", arguments: { ...args, origin: "owner" } })).json()).result.isError).toBe(true);
    expect(ports.request).not.toHaveBeenCalled();
    const body = await (await call("tools/call", { name: "request_booking", arguments: args })).json();
    expect(ports.request).toHaveBeenCalledWith("fixture", { ...args, origin: "agent" });
    expect(body.result).toMatchObject({ isError: false, structuredContent: { reservationId: "b1", status: "held", statusToken: "status-only", confirmationRequired: true } });
    expect(body.result.structuredContent).not.toHaveProperty("managementToken");
    expect(body.result.structuredContent).not.toHaveProperty("confirmationToken");
    expect(ports.updates).toHaveBeenCalledOnce();
  });

  it("hashes status credentials, rejects foreign businesses and never exposes customer data", async () => {
    const token = "s".repeat(43);
    const end = new Date(Date.now() + 3_600_000).toISOString();
    ports.lookup.mockResolvedValue({ id: "b1", tenantId: "fixture", status: "held", start: "start", end, customer: { email: "private@example.test" } });
    const read = () => call("tools/call", { name: "get_booking_status", arguments: { statusToken: token } });
    expect((await (await read()).json()).result.structuredContent).toEqual({ reservationId: "b1", status: "held", start: "start", end });
    expect(ports.lookup).toHaveBeenCalledWith(tokenHash(token), "status");
    ports.lookup.mockResolvedValue({ tenantId: "other" });
    expect((await (await read()).json()).result.isError).toBe(true);
    ports.lookup.mockClear();
    expect((await (await call("tools/call", { name: "get_booking_status", arguments: { statusToken: "invalid" } })).json()).result.isError).toBe(true);
    expect(ports.lookup).not.toHaveBeenCalled();
  });

  it("keeps unavailable and throttled calls from performing operations", async () => {
    ports.enabled.mockRejectedValue(new Error("flag off"));
    expect((await call("tools/call", { name: "list_services" })).status).toBe(503);
    expect(ports.limited).not.toHaveBeenCalled();
    ports.enabled.mockResolvedValue(undefined); ports.limited.mockResolvedValue(true);
    expect((await call("tools/call", { name: "list_services" })).status).toBe(429);
    expect(ports.services).not.toHaveBeenCalled();
  });

  it("rejects unsupported methods, protocols, origins and content types", async () => {
    expect((await GET()).status).toBe(405);
    expect((await call("initialize", {}, { "mcp-protocol-version": "future" })).status).toBe(400);
    expect((await call("initialize", {}, { origin: "https://other.example" })).status).toBe(403);
    expect((await call("initialize", {}, { "content-type": "text/plain" })).status).toBe(415);
    expect((await (await call("unknown")).json()).error.code).toBe(-32601);
    expect((await (await call("tools/call", { name: "confirm_booking" })).json()).error.code).toBe(-32602);
    expect((await call("notifications/initialized", {}, {}, null)).status).toBe(202);
    expect((await call("tools/list", {}, {}, null)).status).toBe(400);
  });

  it("returns native refusal safely and hides internal exceptions", async () => {
    ports.request.mockRejectedValue(new PublicBookingError("conflict", "That time has just been taken."));
    const request = () => call("tools/call", { name: "request_booking", arguments: {} });
    expect((await (await request()).json()).result).toMatchObject({ isError: true, content: [{ type: "text", text: "That time has just been taken." }] });
    ports.request.mockRejectedValue(new Error("private database detail"));
    expect((await (await request()).json()).result.content[0].text).toBe("The booking operation could not complete.");
    expect(ports.updates).not.toHaveBeenCalled();
  });
});
