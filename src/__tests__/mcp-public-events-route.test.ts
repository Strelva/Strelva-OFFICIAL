import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedAsync: async () => false, isRateLimitedWindowedAsync: async () => false, rateLimitKey: (_r: Request, prefix: string) => `${prefix}:ip` }));
vi.mock("@/platform/bookings/native", async (original) => ({ ...(await original<typeof import("@/platform/bookings/native")>()), requireAgentBookings: async () => undefined }));
vi.mock("@/app/api/mcp/_directory", () => ({ tenantDirectory: { list: async () => [], scope: async () => null } }));

import { POST } from "@/app/api/mcp/public/route";

async function toolNames(): Promise<string[]> {
  const response = await POST(new Request("http://localhost/api/mcp/public", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2026-07-28", "mcp-method": "tools/list" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "1", method: "tools/list", params: { _meta: {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": {}, "io.modelcontextprotocol/clientInfo": { name: "fixture", version: "1.0.0" },
    } } }),
  }));
  const body = await response.json();
  return (body.result.tools as { name: string }[]).map((tool) => tool.name);
}

describe("public MCP tools/list and Events", () => {
  beforeEach(() => { vi.stubEnv("STRELVA_WORKSPACE_RELEASE", ""); vi.stubEnv("STRELVA_APP_EVENTS_RELEASE", ""); vi.stubEnv("STRELVA_SITES_BY_CODE_RELEASE", ""); });
  afterEach(() => vi.unstubAllEnvs());

  it("does not list list_recent_events while app_events is off", async () => {
    const names = await toolNames();
    expect(names).toContain("read_business_context");
    expect(names).not.toContain("list_recent_events");
  });

  it("lists it, and only it, once app_events may be on", async () => {
    const before = await toolNames();
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    vi.stubEnv("STRELVA_APP_EVENTS_RELEASE", "workspace");
    const after = await toolNames();
    expect(after).toContain("list_recent_events");
    expect(after.filter((name) => !before.includes(name))).toEqual(["list_recent_events"]);
  });

  it("stays off with the workspace release off, whatever the flag says", async () => {
    vi.stubEnv("STRELVA_APP_EVENTS_RELEASE", "1");
    expect(await toolNames()).not.toContain("list_recent_events");
  });
});
