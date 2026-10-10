import { beforeEach, describe, expect, it, vi } from "vitest";
const ports = vi.hoisted(() => ({ validate: vi.fn(), inspect: vi.fn(), rpc: vi.fn(), scope: vi.fn(), context: vi.fn() }));
vi.mock("@/platform/agent-channel/oauth", async original => ({
  ...await original<typeof import("@/platform/agent-channel/oauth")>(),
  validateAgentToken: ports.validate, inspectAgentToken: ports.inspect, oauthRpc: ports.rpc,
}));
vi.mock("@/platform/bookings/store", () => ({ readBookingContext: ports.context }));
import { createAgentWebsiteAdapter } from "@/products/websites/agent-adapter";
import { withProtectedTools } from "@/platform/agent-channel/protected-tools";
import { serveMcp, type McpServer } from "@/platform/agent-channel/protocol";
import { assistantBusinessContext } from "@/platform/agent-channel/business-context";

const workspaceId = "ac161100-0000-4000-8000-000000000010";
const userId = "ac161100-0000-4000-8000-000000000001";
const otherId = "ac161100-0000-4000-8000-000000000030";
const token = "a".repeat(43);
const at = "2026-10-08T12:00:00Z";
const record = {
  workspaceId, access: "owner", revision: 2, lastSequence: 2, updatedAt: at,
  facts: {
    display_name: { value: "Fictional firm", source: "owner", verified: true, updatedAt: at, updatedBy: userId },
    description: { value: "Review this description", source: "agent", verified: false, updatedAt: at, updatedBy: userId },
    owner_recipient: { value: { email: "private-recipient@example.test" }, source: "owner", verified: true, updatedAt: at, updatedBy: userId },
  },
  services: [{ id: otherId, name: "Website consultation", description: null, durationMinutes: 30, priceText: null,
    active: true, position: 0, externalRef: "private-provider-id", source: "owner", verified: true, updatedAt: at }],
  people: [{ id: userId, name: "Private staff", roleTitle: "Administrator", email: "private-staff@example.test",
    phone: "716-555-0199", userId, active: true, source: "owner", verified: true, updatedAt: at }],
  contactCount: 99, billing: { privateNote: "never expose" },
};
const base: McpServer = {
  name: "strelva", version: "1.0.0", instructions: "Public tools.", tools: [],
  ready: async () => {}, limited: async () => false, call: async () => ({ unknownTool: true }),
};
function server() { return withProtectedTools(base, { list: async () => [], scope: ports.scope }, createAgentWebsiteAdapter(ports.rpc, "https://app.strelva.com")); }
function request(name: string, args: Record<string, unknown> = {}, authenticated = true) {
  return new Request("https://app.strelva.com/api/mcp/public", {
    method: "POST", headers: { "content-type": "application/json", "mcp-protocol-version": "2025-11-25",
      ...(authenticated ? { Authorization: "Bearer " + token } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  ports.validate.mockResolvedValue({ userId, verifiedEmail: "owner@example.test", workspaceId, agencyId: null });
  ports.inspect.mockResolvedValue(null);
  ports.rpc.mockResolvedValue(record);
  ports.scope.mockResolvedValue("fixture");
  ports.context.mockResolvedValue({ workspaceId });
});
describe("assistant business context", () => {
  it("starts from the selected business without public discovery or internal IDs", async () => {
    const response = await serveMcp(request("read_business_context"), server());
    const result = (await response.json()).result;
    expect(result.isError).toBe(false);
    expect(result.structuredContent.workspaceId).toBe(workspaceId);
    expect(ports.validate).toHaveBeenCalledWith(expect.any(Request), "business:read", undefined);
    expect(ports.scope).not.toHaveBeenCalled();
    expect(ports.rpc).toHaveBeenCalledWith("call_agent_protected_tool", expect.objectContaining({
      p_workspace_id: workspaceId, p_args: {}, p_token_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
    expect(JSON.stringify(ports.rpc.mock.calls)).not.toContain(token);
  });
  it("returns only selected facts and services, with source and verification state", () => {
    const projected = assistantBusinessContext(record);
    expect(projected.facts).toEqual({
      display_name: { value: "Fictional firm", source: "owner", verified: true, updatedAt: at },
      description: { value: "Review this description", source: "agent", verified: false, updatedAt: at },
    });
    const text = JSON.stringify(projected);
    for (const privateValue of ["private-recipient", "private-staff", "private-provider", "contactCount", "billing", "updatedBy", "userId", "people"])
      expect(text).not.toContain(privateValue);
  });
  it("challenges absent or revoked access before reading any records", async () => {
    ports.validate.mockResolvedValue(null);
    const response = await serveMcp(request("read_business_context", {}, false), server());
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain('scope="business:read"');
    expect(response.headers.get("www-authenticate")).toContain("/.well-known/oauth-protected-resource/api/mcp/public");
    expect(ports.rpc).not.toHaveBeenCalled();
  });
  it("returns insufficient_scope for a live connection without the requested authority", async () => {
    ports.validate.mockResolvedValue(null);
    ports.inspect.mockResolvedValue({ userId, verifiedEmail: "owner@example.test", workspaceId, agencyId: null, scopes: [] });
    const response = await serveMcp(request("list_websites"), server());
    expect(response.status).toBe(403);
    expect(response.headers.get("www-authenticate")).toContain('error="insufficient_scope"');
    expect(response.headers.get("www-authenticate")).toContain('scope="website:read"');
    expect(ports.rpc).not.toHaveBeenCalled();
  });
  it("preserves current scopes when requesting additional website proposal authority", async () => {
    ports.validate.mockResolvedValue(null);
    ports.inspect.mockResolvedValue({ userId, verifiedEmail: "owner@example.test", workspaceId, agencyId: null, scopes: ["business:read", "website:read"] });
    const response = await serveMcp(request("propose_website_change"), server());
    expect(response.status).toBe(403);
    expect(response.headers.get("www-authenticate")).toContain('error="insufficient_scope"');
    expect(response.headers.get("www-authenticate")).toContain('scope="business:read website:read website:propose"');
    expect(ports.rpc).not.toHaveBeenCalled();
  });
  it("reads selected-business native websites with no public directory lookup", async () => {
    ports.rpc.mockResolvedValue([]);
    const response = await serveMcp(request("list_websites"), server());
    const result = (await response.json()).result;
    expect(result.isError).toBe(false);
    expect(result.structuredContent).toMatchObject({ workspaceId, websites: [] });
    expect(ports.validate).toHaveBeenCalledWith(expect.any(Request), "website:read", undefined);
    expect(ports.scope).not.toHaveBeenCalled();
    expect(ports.rpc).toHaveBeenCalledWith("list_agent_websites", expect.objectContaining({ p_workspace_id: workspaceId }));
  });
  it("gates proposals separately and refuses an agency seat without native owner authority", async () => {
    ports.validate.mockResolvedValue({ userId, verifiedEmail: "owner@example.test", workspaceId, agencyId: otherId });
    const response = await serveMcp(request("propose_website_change", {}), server());
    expect((await response.json()).result.isError).toBe(true);
    expect(ports.validate).toHaveBeenCalledWith(expect.any(Request), "website:propose", undefined);
    expect(ports.rpc).not.toHaveBeenCalled();
  });
  it("advertises proposals as a reviewed write and exposes no publishing tool", () => {
    const tools = server().tools;
    expect(tools.find(t => t.name === "propose_website_change")!.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: true });
    expect(tools.filter(t => /approve.*website|publish.*website|deploy.*website/.test(t.name))).toEqual([]);
  });
  it("does not substitute the connected business for an explicit unauthorized selector", async () => {
    ports.validate.mockResolvedValue(null);
    expect((await serveMcp(request("read_business_context", { workspaceId: otherId }), server())).status).toBe(401);
    expect(ports.validate).toHaveBeenCalledWith(expect.any(Request), "business:read", otherId);
    expect(ports.rpc).not.toHaveBeenCalled();
  });
  it("refuses invalid or ambiguous selectors instead of falling back to the connection", async () => {
    for (const args of [{ workspaceId: "not-a-uuid" }, { workspaceId, business: "fixture" }, { workspaceId: null }]) {
      expect((await serveMcp(request("read_business_context", args), server())).status).toBe(401);
    }
    expect(ports.validate).not.toHaveBeenCalled();
  });
  it("retains explicit business selection for existing clients", async () => {
    const response = await serveMcp(request("read_business_context", { business: "fixture" }), server());
    expect((await response.json()).result.isError).toBe(false);
    expect(ports.validate).toHaveBeenCalledWith(expect.any(Request), "business:read", workspaceId);
  });
  it("refuses extra arguments without executing the protected RPC", async () => {
    const response = await serveMcp(request("read_business_context", { includeCustomers: true }), server());
    expect((await response.json()).result.isError).toBe(true);
    expect(ports.rpc).not.toHaveBeenCalled();
  });
  it("refuses a record from another workspace and malformed fact values", async () => {
    for (const value of [{ ...record, workspaceId: otherId }, { ...record, facts: {
      display_name: { ...record.facts.display_name, value: { privateRecord: "invalid" } },
    } }]) {
      ports.rpc.mockResolvedValue(value);
      const body = await (await serveMcp(request("read_business_context"), server())).json();
      expect(body.result.isError).toBe(true);
      expect(JSON.stringify(body)).not.toContain("privateRecord");
    }
  });
  it("returns no context if transactional grant revalidation fails after bootstrap", async () => {
    ports.rpc.mockRejectedValue(new Error("oauth_invalid_token"));
    const response = await serveMcp(request("read_business_context"), server());
    expect((await response.json()).result.isError).toBe(true);
  });
  it("does not infer a business for inquiry reads or quote approvals", async () => {
    for (const name of ["read_customer_inquiries", "approve_quote"]) {
      expect((await serveMcp(request(name), server())).status).toBe(401);
    }
    expect(ports.validate).not.toHaveBeenCalled();
    expect(ports.rpc).not.toHaveBeenCalled();
  });
  it("clears identity when a reused closure gets a later refused call", async () => {
    const s = server();
    await s.authorize!(request("read_business_context"), { method: "tools/call", tool: "read_business_context", args: {} });
    ports.validate.mockResolvedValue(null);
    await s.authorize!(request("read_business_context"), { method: "tools/call", tool: "read_business_context", args: {} });
    expect(await s.call("read_business_context", {})).toEqual({ ok: false, message: "Authorization is required." });
    expect(ports.rpc).not.toHaveBeenCalled();
  });
});
