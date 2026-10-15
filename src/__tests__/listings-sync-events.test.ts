import { describe, expect, it, vi } from "vitest";
import { appEventSchema } from "@/platform/app-events/contracts";
import { PermanentAppEventError, appEventHandlerFor, resetAppEventHandlers } from "@/platform/app-events/handlers";
import { declaredSubscribers } from "@/platform/app-events/subscriptions";
import { handleFactEvent } from "@/products/listings-sync/events";
import { registerProductAppEventHandlers } from "@/server/app-events/handlers";

const WS = "7f000000-0000-4000-8000-000000000010";
const event = (type: "fact.confirmed" | "fact.changed", data: Record<string, unknown>) => appEventSchema.parse({
  id: "7f000000-0000-4000-8000-0000000000e1", workspaceId: WS, sequence: 1, type, schemaVersion: 1,
  subject: { kind: "fact", id: "phone" }, area: "website", occurredAt: "2026-10-15T00:00:00Z", recordedAt: "2026-10-15T00:00:00Z", data,
});
const confirmedData = (entity: "fact" | "service", entityId: string) => ({ entity, entityId, confirmedByKind: "owner_write", decisionId: null, confirmedAt: "2026-10-15T00:00:00Z" });

describe("handleFactEvent", () => {
  it("queues a check when a phone fact is confirmed", async () => {
    const queue = vi.fn(async () => "check-1");
    expect(await handleFactEvent(event("fact.confirmed", confirmedData("fact", "phone")), { queue })).toEqual({ queued: true, checkId: "check-1" });
    expect(queue).toHaveBeenCalledWith(WS, "fact.confirmed");
  });
  it("queues when a service is confirmed", async () => {
    const queue = vi.fn(async () => "check-1");
    expect((await handleFactEvent(event("fact.confirmed", confirmedData("service", "svc-1")), { queue })).queued).toBe(true);
  });
  it("ignores an email fact", async () => {
    const queue = vi.fn();
    expect(await handleFactEvent(event("fact.confirmed", confirmedData("fact", "email")), { queue })).toEqual({ queued: false, checkId: null });
    expect(queue).not.toHaveBeenCalled();
  });
  it("does not act on fact.changed", async () => {
    const queue = vi.fn();
    const changed = event("fact.changed", { entity: "fact", key: "phone", change: "updated", source: "owner", verified: false, pendingOwner: true });
    expect(await handleFactEvent(changed, { queue })).toEqual({ queued: false, checkId: null });
    expect(queue).not.toHaveBeenCalled();
  });
  it("reports a queue that declined (App unavailable) as not queued", async () => {
    expect(await handleFactEvent(event("fact.confirmed", confirmedData("fact", "hours")), { queue: async () => null })).toEqual({ queued: false, checkId: null });
  });
  it("sets a malformed event aside for good", async () => {
    await expect(handleFactEvent(event("fact.confirmed", { entity: "fact" }), { queue: vi.fn() })).rejects.toBeInstanceOf(PermanentAppEventError);
  });
  it("lets a queue error through so the dispatcher retries", async () => {
    await expect(handleFactEvent(event("fact.confirmed", confirmedData("fact", "phone")), { queue: async () => { throw new Error("db down"); } })).rejects.toThrow("db down");
  });
});

describe("registration", () => {
  it("registers a handler for every declared subscriber, including Listings in sync", () => {
    resetAppEventHandlers();
    registerProductAppEventHandlers();
    const listings = declaredSubscribers().find(item => item.appId === "listings_sync");
    expect(listings).toMatchObject({ handler: "queue_check", events: ["fact.confirmed"] });
    for (const item of declaredSubscribers()) expect(appEventHandlerFor(item.appId, item.handler), item.subscriber).not.toBeNull();
    resetAppEventHandlers();
  });
});
