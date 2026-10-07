import { afterEach, describe, expect, it, vi } from "vitest";
import { tenantEventAdapter } from "@/platform/needs-you/adapters";
import { workspacePublishingScope } from "@/platform/infra/publishing-scope";
import type { UnifiedEvent } from "@/platform/infra/event-contract";
const workspaceId = "af100000-0000-4000-8000-000000000010";
const scope = workspacePublishingScope(workspaceId);
const event: UnifiedEvent = { id: "evt-native", tenantId: scope, source: "ai", type: "content_update", status: "pending", title: "Native draft", body: "Exact words", createdAt: "now", metadata: { kind: "workspace_collection_publish", workspaceId, reviewAudience: "owner" } };
afterEach(() => vi.unstubAllEnvs());
describe("native publishing in the existing Needs you adapter", () => {
  it("finds native drafts without linked tenants and keeps the signed owner resolver", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    vi.stubEnv("STRELVA_PUBLISHING_RELEASE", "1");
    const resolveEventAction = vi.fn(async () => ({ changed: true }));
    const adapter = tenantEventAdapter({ linkedTenants: async () => [], pendingEvents: async key => key === scope ? [event] : [], readEvent: async () => event, resolveEventAction });
    const { items } = await adapter.propose({ workspaceId });
    expect(items).toHaveLength(1); expect(items[0]).toMatchObject({ sourceId: `${scope}:${event.id}`, route: "owner_decides", adminMayDecide: false });
    expect(await adapter.currentRevision({ workspaceId }, items[0]!.sourceId)).toBe(items[0]!.revisionHash);
    expect(await adapter.resolve({ workspaceId }, items[0] as never, "approve", { kind: "owner_link", recipient: "owner@example.test", actor: null })).toMatchObject({ outcome: "done" });
    expect(resolveEventAction).toHaveBeenCalledWith(scope, event.id, "approved", "owner-link:owner@example.test");
    expect(await adapter.currentRevision({ workspaceId: "af100000-0000-4000-8000-000000000011" }, items[0]!.sourceId)).toBeNull();
  });
  it("flags off do not read a native queue", async () => {
    vi.stubEnv("STRELVA_PUBLISHING_RELEASE", "0");
    const pendingEvents = vi.fn(async () => [event]);
    const adapter = tenantEventAdapter({ linkedTenants: async () => [], pendingEvents, readEvent: async () => event, resolveEventAction: async () => ({ changed: true }) });
    expect(await adapter.propose({ workspaceId })).toMatchObject({ items: [] });
    expect(pendingEvents).not.toHaveBeenCalled();
  });
});
