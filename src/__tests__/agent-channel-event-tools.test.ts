import { describe, expect, it, vi } from "vitest";
import { createAgentEventsAdapter } from "@/platform/app-events/agent";
import { AGENT_EVENT_TOOLS, isAgentEventToolName } from "@/platform/agent-channel/event-tools";

const authority = { tokenHash: "a".repeat(64), resource: "https://app.strelva.com/api/mcp/public", workspaceId: "28100000-0000-4000-8000-000000000010", agencyId: null };
const read = { events: [], nextAfter: 0, lastSequence: 0, captureOn: true };

describe("list_recent_events adapter", () => {
  it("names one tool", () => {
    expect([...AGENT_EVENT_TOOLS]).toEqual(["list_recent_events"]);
    expect(isAgentEventToolName("list_recent_events")).toBe(true);
    expect(isAgentEventToolName("list_site_requests")).toBe(false);
  });

  it("refuses with app_events_off before reading, when the business is not released", async () => {
    const rpc = vi.fn();
    const adapter = createAgentEventsAdapter({ rpc, released: async () => false });
    await expect(adapter.list({}, authority)).rejects.toThrow("app_events_off");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes the exact RPC arguments", async () => {
    const rpc = vi.fn(async () => read);
    const adapter = createAgentEventsAdapter({ rpc, released: async () => true });
    await expect(adapter.list({}, authority)).resolves.toEqual(read);
    expect(rpc).toHaveBeenLastCalledWith("agent_read_app_events", {
      p_token_hash: authority.tokenHash, p_resource: authority.resource, p_workspace_id: authority.workspaceId, p_after: 0, p_types: null, p_limit: 50,
    });
    await adapter.list({ after: 7, types: ["booking.made", "fact.changed"], limit: 5 }, { ...authority, agencyId: "28100000-0000-4000-8000-000000000020" });
    expect(rpc).toHaveBeenLastCalledWith("agent_read_app_events", expect.objectContaining({ p_after: 7, p_types: ["booking.made", "fact.changed"], p_limit: 5 }));
  });

  it("refuses limit 0, an unknown type, a negative after and extra keys", async () => {
    const rpc = vi.fn(async () => read);
    const adapter = createAgentEventsAdapter({ rpc, released: async () => true });
    for (const bad of [{ limit: 0 }, { limit: 101 }, { types: ["booking.deleted"] }, { after: -1 }, { after: 1.5 }, { workspaceId: "x" }, { types: new Array(11).fill("booking.made") }]) {
      await expect(adapter.list(bad as never, authority), JSON.stringify(bad)).rejects.toThrow();
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a malformed answer", async () => {
    const adapter = createAgentEventsAdapter({ rpc: async () => ({ events: [{ sequence: 1 }] }), released: async () => true });
    await expect(adapter.list({}, authority)).rejects.toThrow();
  });
});
