import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory zset stand-in: getOpenChangeRequest reads the tenant event sorted
// set newest-first via zrange(..., { rev: true }) and status-filters in JS.
// We feed it the JSON-encoded members the real store would hold.
let zsetMembers: string[] = [];

const mockRedis = {
  zrange: vi.fn(async () => zsetMembers),
  // getEvents resolves each member id via mget against event:{id}; returning
  // nulls makes it fall back to the embedded legacy JSON we feed via zrange.
  mget: vi.fn(async (...keys: string[]) => keys.map(() => null)),
};

vi.mock("../lib/redis", () => ({
  getRedis: () => mockRedis,
}));

import { getOpenChangeRequest } from "../lib/events";
import type { UnifiedEvent } from "../lib/types";

function event(partial: Partial<UnifiedEvent>): UnifiedEvent {
  return {
    id: partial.id ?? "evt_x",
    tenantId: partial.tenantId ?? "tenant-a",
    source: partial.source ?? "website",
    type: partial.type ?? "change_request",
    title: partial.title ?? "Some request",
    body: partial.body ?? "",
    status: partial.status ?? "pending",
    createdAt: partial.createdAt ?? "2026-06-01T00:00:00.000Z",
    metadata: partial.metadata,
  } as UnifiedEvent;
}

// Members are returned newest-first (rev: true). Order them with newest first.
function setEvents(events: UnifiedEvent[]) {
  zsetMembers = events.map((e) => JSON.stringify(e));
}

describe("getOpenChangeRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    zsetMembers = [];
  });

  it("returns a pending custom change_request (dashboard kind)", async () => {
    setEvents([
      event({
        id: "evt_custom",
        title: "Requested custom change: New booking flow",
        metadata: { kind: "custom_code_or_design_request" },
      }),
    ]);

    const open = await getOpenChangeRequest("tenant-a");
    expect(open?.id).toBe("evt_custom");
  });

  it("treats a legacy kind-less pending change_request as a custom request", async () => {
    setEvents([
      event({ id: "evt_legacy", title: "Old request", metadata: undefined }),
    ]);

    const open = await getOpenChangeRequest("tenant-a");
    expect(open?.id).toBe("evt_legacy");
  });

  it("does NOT count an offboarding handoff as an open custom request", async () => {
    setEvents([
      event({
        id: "evt_offboard",
        title: "Handoff requested from Ownership Center",
        metadata: { kind: "offboarding_handoff_request" },
      }),
    ]);

    const open = await getOpenChangeRequest("tenant-a");
    expect(open).toBeNull();
  });

  it("skips an offboarding handoff and returns the real custom request behind it", async () => {
    // Newest-first: the handoff is most recent, the custom build is older but
    // still pending — the gate must surface the custom build, not the handoff.
    setEvents([
      event({
        id: "evt_offboard",
        title: "Handoff requested from Ownership Center",
        metadata: { kind: "offboarding_handoff_request" },
      }),
      event({
        id: "evt_custom",
        title: "Requested custom change: New booking flow",
        metadata: { kind: "custom_code_or_design_request" },
      }),
    ]);

    const open = await getOpenChangeRequest("tenant-a");
    expect(open?.id).toBe("evt_custom");
  });
});
