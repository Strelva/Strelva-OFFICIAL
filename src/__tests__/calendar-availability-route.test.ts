import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  release: vi.fn(() => true),
  availability: vi.fn(),
}));

vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: mocks.release }));
vi.mock("@/platform/workspaces/http", () => ({
  workspaceHttpActor: mocks.actor,
  workspaceHttpFailure: vi.fn((error: unknown) => Response.json({ error: "fixture failure" }, { status: error && typeof error === "object" && (error as { name?: string }).name === "ZodError" ? 400 : 503 })),
  workspaceJson: (value: unknown, status = 200) => Response.json(value, { status }),
}));
vi.mock("@/products/scheduling/server", () => ({ readWorkspaceProviderAvailability: mocks.availability }));

import { GET } from "@/app/api/workspace/calendar-availability/route";

const actor = { userId: "11111111-1111-4111-8111-111111111111", verifiedEmail: "owner@example.test" };
const workspaceId = "33333333-3333-4333-8333-333333333333";

describe("calendar availability HTTP boundary", () => {
  beforeEach(() => {
    mocks.actor.mockReset();
    mocks.availability.mockReset();
  });

  it("reads provider busy evidence only after an authenticated explicit query", async () => {
    mocks.actor.mockResolvedValue(actor);
    mocks.availability.mockResolvedValue({ provider: "outlook", timeZone: "America/New_York", busy: [], observedAt: "2026-09-20T15:00:00.000Z" });
    const response = await GET(new Request(`https://workspace.test/api/workspace/calendar-availability?workspaceId=${workspaceId}&provider=outlook&start=2026-09-20T13:00:00.000Z&end=2026-09-20T14:00:00.000Z`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ provider: "outlook", timeZone: "America/New_York", busy: [], observedAt: "2026-09-20T15:00:00.000Z" });
    expect(mocks.availability).toHaveBeenCalledWith(actor, workspaceId, "outlook", expect.objectContaining({ start: "2026-09-20T13:00:00.000Z", end: "2026-09-20T14:00:00.000Z" }));
  });

  it("rejects an invalid interval before reaching the provider boundary", async () => {
    mocks.actor.mockResolvedValue(actor);
    const response = await GET(new Request(`https://workspace.test/api/workspace/calendar-availability?workspaceId=${workspaceId}&provider=google&start=2026-09-20T14:00:00.000Z&end=2026-09-20T13:00:00.000Z`));
    expect(response.status).toBe(400);
    expect(mocks.availability).not.toHaveBeenCalled();
  });
});
