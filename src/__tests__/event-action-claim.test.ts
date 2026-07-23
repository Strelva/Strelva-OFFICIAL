import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, unknown>();
const redis = {
  get: vi.fn(async (key: string) => store.get(key) ?? null),
  set: vi.fn(async (key: string, value: unknown, options?: { nx?: boolean }) => {
    if (options?.nx && store.has(key)) return null;
    store.set(key, value);
    return "OK";
  }),
  del: vi.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
};

vi.mock("@/lib/redis", () => ({ getRedis: () => redis }));

import { claimEventAction, finishEventAction, markExecutionExternalAccepted } from "@/lib/events";

describe("event action claim", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.clear();
    store.set("event:evt_1", {
      id: "evt_1",
      tenantId: "tenant-a",
      source: "ai",
      type: "content_update",
      title: "Pending",
      body: "",
      status: "pending",
      createdAt: "2026-07-01T00:00:00.000Z",
      metadata: {},
    });
  });

  it("allows one processor and exposes processing/completed execution state", async () => {
    const first = await claimEventAction("evt_1", "approved", "owner");
    expect(first.acquired).toBe(true);
    if (!first.acquired) return;

    await expect(claimEventAction("evt_1", "approved", "owner")).resolves.toEqual({
      acquired: false,
      reason: "action_in_progress",
    });
    expect((store.get("event:evt_1") as { metadata: { execution: { state: string } } }).metadata.execution.state)
      .toBe("processing");

    await finishEventAction("evt_1", first.attemptId, { state: "completed" });
    expect((store.get("event:evt_1") as { metadata: { execution: { state: string } } }).metadata.execution.state)
      .toBe("completed");
    expect(store.has("event-action:evt_1")).toBe(false);
  });

  it("fails closed after a crashed processing attempt instead of risking a duplicate write", async () => {
    const first = await claimEventAction("evt_1", "approved", "owner");
    expect(first.acquired).toBe(true);

    // Simulate the process dying after the provider call: the ephemeral lock
    // expires, but no completed/failed outcome was recorded.
    store.delete("event-action:evt_1");

    await expect(claimEventAction("evt_1", "approved", "owner")).resolves.toEqual({
      acquired: false,
      reason: "action_reconciliation_required",
    });
  });

  it("blocks a re-claim after an external write was accepted (no duplicate publish)", async () => {
    const first = await claimEventAction("evt_1", "approved", "owner");
    expect(first.acquired).toBe(true);

    // The provider accepted the non-idempotent write; mark acceptance.
    await markExecutionExternalAccepted("evt_1");
    expect(
      (store.get("event:evt_1") as { metadata: { execution: { state: string } } }).metadata.execution.state,
    ).toBe("external_accepted");

    // The subsequent resolve failed (lost lock / crash) — finish as failed.
    if (first.acquired) await finishEventAction("evt_1", first.attemptId, { state: "failed" });
    // The marker must NOT be downgraded to "failed" — it stays blocking.
    expect(
      (store.get("event:evt_1") as { metadata: { execution: { state: string } } }).metadata.execution.state,
    ).toBe("external_accepted");

    // A retry is refused with reconciliation, not granted a fresh attempt.
    await expect(claimEventAction("evt_1", "approved", "owner")).resolves.toEqual({
      acquired: false,
      reason: "action_reconciliation_required",
    });
  });

  it("preserves a bounded event TTL when execution metadata changes", async () => {
    const first = await claimEventAction("evt_1", "approved", "owner");
    expect(first.acquired).toBe(true);
    const eventWrite = redis.set.mock.calls.find(
      ([key, , options]) => key === "event:evt_1" && options && "ex" in options,
    );
    expect(eventWrite?.[2]).toMatchObject({ ex: expect.any(Number) });
    expect((eventWrite?.[2] as { ex: number }).ex).toBeGreaterThan(0);
    expect((eventWrite?.[2] as { ex: number }).ex).toBeLessThanOrEqual(90 * 24 * 60 * 60);
  });
});
