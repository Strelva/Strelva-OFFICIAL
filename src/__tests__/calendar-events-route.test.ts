import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  release: vi.fn(() => true),
  read: vi.fn(),
  create: vi.fn(),
  reschedule: vi.fn(),
  cancel: vi.fn(),
  recover: vi.fn(),
  receipt: vi.fn(),
}));

vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: mocks.release }));
vi.mock("@/platform/workspaces/http", () => ({
  workspaceHttpActor: mocks.actor,
  workspaceHttpFailure: vi.fn((error: unknown) => Response.json({ error: "fixture failure" }, { status: error && typeof error === "object" && (error as { name?: string }).name === "ZodError" ? 400 : 503 })),
  workspaceJson: (value: unknown, status = 200) => Response.json(value, { status }),
  workspaceWriteGuard: vi.fn(() => null),
  readWorkspaceBody: async (request: Request) => request.json(),
}));
vi.mock("@/products/scheduling/server", () => ({
  calendarSchedulingService: { read: mocks.read, create: mocks.create, reschedule: mocks.reschedule, cancel: mocks.cancel, recover: mocks.recover },
  readCalendarEventReceipt: mocks.receipt,
}));

import { GET, POST } from "@/app/api/workspace/calendar-events/route";

const actor = { userId: "11111111-1111-4111-8111-111111111111", verifiedEmail: "owner@example.test" };
const workId = "22222222-2222-4222-8222-222222222222";
const workspaceId = "33333333-3333-4333-8333-333333333333";

describe("calendar event HTTP boundary", () => {
  it("returns the schedule and receipt without exposing provider credentials", async () => {
    mocks.actor.mockResolvedValue(actor);
    mocks.read.mockResolvedValue({ id: workId, payload: { revision: 2 } });
    mocks.receipt.mockResolvedValue({ provider: "outlook", status: "accepted", externalEventId: "event-1" });
    const response = await GET(new Request(`https://workspace.test/api/workspace/calendar-events?workspaceId=${workspaceId}&workId=${workId}&requestId=request-1&provider=outlook`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ schedule: { id: workId, payload: { revision: 2 } }, receipt: { provider: "outlook", status: "accepted", externalEventId: "event-1" } });
  });

  it("passes a reschedule with the expected local revision to the governed service", async () => {
    mocks.actor.mockResolvedValue(actor);
    mocks.reschedule.mockResolvedValue({ id: workId, payload: { revision: 3, reservations: [] } });
    const response = await POST(new Request("https://workspace.test/api/workspace/calendar-events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reschedule", workId, requestId: "request-1", provider: "outlook", expectedRevision: 2, start: "2026-09-20T10:00:00Z", end: "2026-09-20T11:00:00Z" }) }));
    expect(response.status).toBe(200);
    expect(mocks.reschedule).toHaveBeenCalledWith(actor, workId, "request-1", expect.objectContaining({ expectedRevision: 2, start: "2026-09-20T10:00:00Z" }));
  });

  it("rejects malformed commands before reaching the provider service", async () => {
    mocks.actor.mockResolvedValue(actor);
    const response = await POST(new Request("https://workspace.test/api/workspace/calendar-events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create", workId: "not-a-uuid", requestId: "request-1", provider: "outlook" }) }));
    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
