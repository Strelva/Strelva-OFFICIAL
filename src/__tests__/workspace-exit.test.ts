import { describe, expect, it, vi } from "vitest";

const mockComplete = vi.hoisted(() => vi.fn());
const mockRead = vi.hoisted(() => vi.fn());
const mockActor = vi.hoisted(() => vi.fn());
const mockBody = vi.hoisted(() => vi.fn());
const mockGuard = vi.hoisted(() => vi.fn());
const mockFailure = vi.hoisted(() => vi.fn());
const mockJson = vi.hoisted(() => vi.fn((value: unknown, status = 200) => Response.json(value, { status })));

vi.mock("@/platform/workspace-exit", () => ({ completeWorkspaceExit: mockComplete, readWorkspaceExit: mockRead }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => true }));
vi.mock("@/platform/workspaces/http", () => ({
  workspaceHttpActor: mockActor,
  readWorkspaceBody: mockBody,
  workspaceWriteGuard: mockGuard,
  workspaceHttpFailure: mockFailure,
  workspaceJson: mockJson,
}));
import {
  workspaceExitCommandSchema,
  workspaceExitStateSchema,
} from "@/platform/workspace-exit/contracts";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const successorId = "22222222-2222-4222-8222-222222222222";

describe("workspace exit contract", () => {
  it("requires an explicit future-work, provider, and maintained-resource decision", () => {
    const command = workspaceExitCommandSchema.parse({
      workspaceId,
      futureWork: "pause",
      providerParticipation: "revoke",
      maintainedResources: { kind: "successor", successorUserId: successorId },
      notes: "The owner is leaving after the handoff review.",
      idempotencyKey: "exit-owner-1",
    });

    expect(command).toMatchObject({
      workspaceId,
      futureWork: "pause",
      providerParticipation: "revoke",
      maintainedResources: { kind: "successor", successorUserId: successorId },
    });
  });

  it("does not accept a successor choice without a named workspace member", () => {
    expect(() => workspaceExitCommandSchema.parse({
      workspaceId,
      futureWork: "cancelled",
      providerParticipation: "keep",
      maintainedResources: { kind: "successor" },
      idempotencyKey: "exit-owner-2",
    })).toThrow();
  });

  it("accepts an honest completed state with retained obligations", () => {
    const state = workspaceExitStateSchema.parse({
      id: "33333333-3333-4333-8333-333333333333",
      workspaceId,
      status: "completed",
      requestedAt: "2026-09-20T14:00:00.000Z",
      completedAt: "2026-09-20T14:00:01.000Z",
      requestedBy: "44444444-4444-4444-8444-444444444444",
      futureWork: "cancelled",
      providerParticipation: "kept",
      maintainedResources: { kind: "stopped" },
      summary: {
        standingPaused: 0,
        standingRevoked: 1,
        scheduledPaused: 0,
        scheduledCancelled: 2,
        assignmentsRevoked: 1,
        providerDeliveriesRevoked: 0,
        investigationsPaused: 1,
        retainedAccepted: 1,
        retainedUnknown: 1,
      },
      retainedObligations: [{
        workId: "55555555-5555-4555-8555-555555555555",
        title: "Accepted request",
        status: "accepted",
        effect: "accepted",
      }],
      resources: [{
        kind: "offering",
        id: "66666666-6666-4666-8666-666666666666",
        status: "stopped",
      }],
    });

    expect(state.summary.retainedUnknown).toBe(1);
    expect(state.retainedObligations[0]?.effect).toBe("accepted");
  });
});

describe("workspace exit route", () => {
  mockFailure.mockImplementation(() => Response.json({ error: "The operation could not be confirmed." }, { status: 503 }));

  it("keeps a denied member from starting the stop-work command", async () => {
    mockActor.mockResolvedValue({ userId: "44444444-4444-4444-8444-444444444444", verifiedEmail: "owner@example.test" });
    mockGuard.mockReturnValue(null);
    mockBody.mockResolvedValue({});
    mockComplete.mockRejectedValue(new Error("unexpected command"));
    const { POST } = await import("@/app/api/workspace-exit/route");
    const response = await POST(new Request("http://localhost/api/workspace-exit", { method: "POST", headers: { origin: "http://localhost" }, body: "{}" }));
    expect(response.status).toBe(503);
    expect(mockComplete).toHaveBeenCalled();
  });

  it("returns the durable state for the owner route", async () => {
    mockActor.mockResolvedValue({ userId: "44444444-4444-4444-8444-444444444444", verifiedEmail: "owner@example.test" });
    mockRead.mockResolvedValue({ state: null, successors: [] });
    const { GET } = await import("@/app/api/workspace-exit/route");
    const response = await GET(new Request(`http://localhost/api/workspace-exit?workspaceId=${workspaceId}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ state: null, successors: [] });
  });
});
