import { beforeEach, describe, expect, it } from "vitest";
import type { UnifiedEvent } from "@/lib/types";
import { tenantEventAdapter } from "@/platform/needs-you/adapters";
import { createNeedsYouService } from "@/platform/needs-you/service";
import { needsYouMemoryStore } from "./support/needs-you-memory";

const WS = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER_WS = "aaaaaaaa-0000-4000-8000-000000000002";

function event(over: Partial<UnifiedEvent> = {}): UnifiedEvent {
  return { id: "evt-1", tenantId: "fixture-firm", source: "ai", type: "review", title: "Drafted reply", body: "Thank you!", status: "pending",
    createdAt: "2026-10-05T09:02:00Z", metadata: { kind: "review_reply_draft", replyGeneration: "model", rating: 4 }, ...over };
}

let memory: ReturnType<typeof needsYouMemoryStore>;
let events: UnifiedEvent[];

function service() {
  return createNeedsYouService({
    store: { ...memory.store, async linkedTenants(ws) { return ws === WS ? [{ workspaceId: WS, tenantId: "fixture-firm" }] : []; } },
    appOrigin: "https://app.example.test",
    now: () => Date.parse("2026-10-06T11:00:00Z"),
    sendEmail: async () => ({ status: "suppressed" as const, reason: "email_suppressed_or_unconfigured" }),
    adapters: [tenantEventAdapter({
      linkedTenants: async (ws) => (ws === WS ? ["fixture-firm"] : []),
      pendingEvents: async (tenantId) => events.filter(e => e.tenantId === tenantId && e.status === "pending"),
      readEvent: async (id) => events.find(e => e.id === id) ?? null,
      resolveEventAction: async () => ({ changed: true }),
    })],
  });
}

beforeEach(() => {
  memory = needsYouMemoryStore({ clock: { now: Date.parse("2026-10-06T11:00:00Z") } });
  events = [event()];
});

describe("openForSource", () => {
  it("opens the item from the adapter's proposal when none exists", async () => {
    const item = await service().openForSource(WS, "tenant_event", "fixture-firm:evt-1");
    expect(item).toMatchObject({ state: "open", route: "owner_decides", sourceId: "fixture-firm:evt-1" });
    expect(memory.items.size).toBe(1);
  });

  it("returns the existing open item without opening another", async () => {
    const first = await service().openForSource(WS, "tenant_event", "fixture-firm:evt-1");
    const second = await service().openForSource(WS, "tenant_event", "fixture-firm:evt-1");
    expect(second?.id).toBe(first?.id);
    expect(memory.items.size).toBe(1);
  });

  it("returns null for an unknown source or lifecycle", async () => {
    expect(await service().openForSource(WS, "tenant_event", "fixture-firm:nope")).toBeNull();
    expect(await service().openForSource(WS, "booking_request", "fixture-firm:evt-1")).toBeNull();
    expect(memory.items.size).toBe(0);
  });

  it("never opens for a different workspace", async () => {
    expect(await service().openForSource(OTHER_WS, "tenant_event", "fixture-firm:evt-1")).toBeNull();
    expect(memory.items.size).toBe(0);
  });
});
