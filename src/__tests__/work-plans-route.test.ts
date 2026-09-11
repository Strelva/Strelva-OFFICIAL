import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  release: vi.fn(),
  rate: vi.fn(),
  create: vi.fn(),
  read: vi.fn(),
  list: vi.fn(),
  present: vi.fn(),
}));

vi.mock("@/lib/db/server-client", () => ({ getSessionUser: mocks.user }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: mocks.release }));
vi.mock("@/lib/rate-limit", () => ({ isRateLimitedWindowedAsync: mocks.rate }));
vi.mock("@/products/work-plans", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/products/work-plans");
  return { ...actual, createWorkPlan: mocks.create, readWorkPlan: mocks.read, listWorkPlanOutputs: mocks.list, presentWorkPlan: mocks.present };
});

import { GET, POST } from "@/app/api/work-plans/route";
import { WorkspaceAccessError } from "@/platform/workspaces/types";

const workspaceId = "22222222-2222-4222-8222-222222222222";
const workId = "33333333-3333-4333-8333-333333333333";
const user = { id: "11111111-1111-4111-8111-111111111111", email: "Owner@example.com", email_confirmed_at: "2026-09-11" };
const record = { work: { id: workId }, plan: { version: 1 } };

function postRequest(value: unknown, headers: Record<string, string> = {}) {
  return new Request("https://app.strelva.com/api/work-plans", {
    method: "POST",
    headers: { origin: "https://app.strelva.com", "content-type": "application/json", ...headers },
    body: JSON.stringify(value),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.release.mockReturnValue(true);
  mocks.user.mockResolvedValue(user);
  mocks.rate.mockResolvedValue(false);
  mocks.create.mockResolvedValue(record);
  mocks.read.mockResolvedValue(record);
  mocks.list.mockResolvedValue([]);
  mocks.present.mockReturnValue({ work: { id: workId }, plan: { version: 1, status: "ready" } });
});

describe("workspace work-plan route", () => {
  it("requires a confirmed authenticated actor", async () => {
    mocks.user.mockResolvedValue({ id: user.id, email: user.email });
    const response = await POST(postRequest({ workspaceId, userGoal: "Make a tracker" }));
    expect(response.status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("creates through the server planner and returns the stable saved-work shape", async () => {
    const response = await POST(postRequest({ workspaceId, userGoal: "Make a tracker" }));
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith({
      actor: { userId: user.id, verifiedEmail: "owner@example.com" },
      workspaceId,
      userGoal: "Make a tracker",
      evidence: [],
    });
    expect(await response.json()).toEqual({ work: { id: workId }, plan: { version: 1, status: "ready" } });
  });

  it("reloads a saved plan through workspace authorization", async () => {
    const response = await GET(new Request(`https://app.strelva.com/api/work-plans?workspaceId=${workspaceId}&workId=${workId}`));
    expect(response.status).toBe(200);
    expect(mocks.read).toHaveBeenCalledWith({
      actor: { userId: user.id, verifiedEmail: "owner@example.com" },
      workspaceId,
      workId,
    });
    expect(await response.json()).toEqual({ work: { id: workId }, plan: { version: 1, status: "ready" } });
  });

  it("maps workspace denial without exposing storage details", async () => {
    mocks.create.mockRejectedValue(new WorkspaceAccessError("database details"));
    const response = await POST(postRequest({ workspaceId, userGoal: "Make a tracker" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "This workspace is unavailable to your account." });
  });
});
