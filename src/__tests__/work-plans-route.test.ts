import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  release: vi.fn(),
  rate: vi.fn(),
  create: vi.fn(),
  read: vi.fn(),
  list: vi.fn(),
  present: vi.fn(),
  fallback: vi.fn(),
}));

vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: mocks.user }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: mocks.release }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedWindowedAsync: mocks.rate }));
vi.mock("@/products/work-plans/failure-request", () => ({ fileFailedSystemPlanRequest: mocks.fallback }));
vi.mock("@/products/work-plans", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/products/work-plans");
  return { ...actual, createWorkPlan: mocks.create, readWorkPlan: mocks.read, listWorkPlanOutputs: mocks.list, presentWorkPlan: mocks.present };
});

import { GET, POST } from "@/app/api/work-plans/route";
import { WorkPlanFundingRequiredError, WorkPlanUnavailableError } from "@/products/work-plans";
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
  mocks.fallback.mockResolvedValue(null);
});

describe("workspace work-plan route", () => {
  it("reports the confirmed fallback Request without claiming a plan or accepted job", async () => {
    mocks.create.mockRejectedValue(new WorkPlanUnavailableError());
    mocks.fallback.mockResolvedValue(workId);
    const response = await POST(postRequest({ workspaceId, userGoal: "Make an intake" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Strelva couldn't draft this yet. Your Request is filed for review; scope and deadline are not agreed.", code: "planning_request_filed", requestId: workId });
    expect(mocks.present).not.toHaveBeenCalled();
  });
  it("preserves the original unavailable response when Systems is off", async () => {
    mocks.create.mockRejectedValue(new WorkPlanUnavailableError());
    const response = await POST(postRequest({ workspaceId, userGoal: "Make an intake" }));
    expect(await response.json()).toEqual({ error: "Planning is unavailable right now. Nothing was saved.", code: "planning_unavailable" });
  });
  it("preserves the failed goal when fallback storage also fails", async () => {
    mocks.create.mockRejectedValue(new WorkPlanUnavailableError()); mocks.fallback.mockRejectedValue(new Error("storage"));
    const response = await POST(postRequest({ workspaceId, userGoal: "Make an intake" }));
    expect(await response.json()).toMatchObject({ code: "planning_request_failed", error: expect.stringContaining("could not be saved") });
  });
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

  it("rejects model planning when no accepted economics job is supplied", async () => {
    mocks.create.mockRejectedValue(new WorkPlanFundingRequiredError());
    const response = await POST(postRequest({ workspaceId, userGoal: "Make a tracker" }));
    expect(response.status).toBe(428);
    expect(await response.json()).toEqual({
      error: "Accept a planning budget before requesting a model-backed plan.",
      code: "planning_funding_required",
    });
  });

  it("passes the accepted planning job and execution identity to the planner", async () => {
    const planningEconomics = {
      jobId: "44444444-4444-4444-8444-444444444444",
      executionKey: "planning:attempt-1",
      maximumCents: 125,
    };
    const response = await POST(postRequest({ workspaceId, userGoal: "Make a tracker", planningEconomics }));
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith({
      actor: { userId: user.id, verifiedEmail: "owner@example.com" },
      workspaceId,
      userGoal: "Make a tracker",
      evidence: [],
      planningEconomics,
    });
  });
});
