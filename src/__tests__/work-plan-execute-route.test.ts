import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  release: vi.fn(),
  rate: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("@/lib/db/server-client", () => ({ getSessionUser: mocks.user }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: mocks.release }));
vi.mock("@/lib/rate-limit", () => ({ isRateLimitedWindowedAsync: mocks.rate }));
vi.mock("@/products/work-plans", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/products/work-plans");
  return { ...actual, executeWorkPlanOutput: mocks.execute };
});

import { POST } from "@/app/api/work-plans/execute/route";
import { WorkspaceAccessError } from "@/platform/workspaces/types";

const workspaceId = "22222222-2222-4222-8222-222222222222";
const planWorkId = "33333333-3333-4333-8333-333333333333";
const user = { id: "11111111-1111-4111-8111-111111111111", email: "Owner@example.com", email_confirmed_at: "2026-09-11" };
const execution = {
  planWorkId,
  outputId: "private-doc",
  status: "completed",
  nativeWorkId: "44444444-4444-4444-8444-444444444444",
  nativeProductId: "documents",
  nativeResourceKind: "document",
  receipt: { version: 1, kind: "work_plan_output", planWorkId, outputId: "private-doc", planRevision: 1, operationId: "create_document", actorId: user.id, nativeWorkId: "44444444-4444-4444-8444-444444444444", completedAt: "2026-09-11T00:00:00.000Z" },
};

function request(value: unknown, headers: Record<string, string> = {}) {
  return new Request("https://app.strelva.com/api/work-plans/execute", {
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
  mocks.execute.mockResolvedValue(execution);
});

describe("work-plan output execution route", () => {
  it("returns the direct durable execution receipt", async () => {
    const response = await POST(request({
      workspaceId,
      planWorkId,
      outputId: "private-doc",
      expectedPlanRevision: 1,
      operationId: "create_document",
      inputs: { title: "Procedure", text: "Review first." },
    }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(execution);
    expect(mocks.execute).toHaveBeenCalledWith({
      actor: { userId: user.id, verifiedEmail: "owner@example.com" },
      workspaceId,
      planWorkId,
      outputId: "private-doc",
      expectedPlanRevision: 1,
      operationId: "create_document",
      inputs: { title: "Procedure", text: "Review first." },
      decisions: {},
    });
  });

  it("requires a confirmed actor before calling the execution seam", async () => {
    mocks.user.mockResolvedValue({ id: user.id, email: user.email });
    const response = await POST(request({ workspaceId, planWorkId, outputId: "private-doc", expectedPlanRevision: 1, operationId: "create_document" }));
    expect(response.status).toBe(401);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("does not expose persistence details on workspace denial", async () => {
    mocks.execute.mockRejectedValue(new WorkspaceAccessError("database details"));
    const response = await POST(request({ workspaceId, planWorkId, outputId: "private-doc", expectedPlanRevision: 1, operationId: "create_document" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "This workspace is unavailable to your account." });
  });
});
