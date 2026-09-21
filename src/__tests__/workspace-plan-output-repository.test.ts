import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  getSupabase: () => ({ rpc: mocks.rpc }),
}));

import { persistWorkPlanOutput } from "@/platform/workspaces/plan-output";

const input = {
  actor: { userId: "11111111-1111-4111-8111-111111111111", verifiedEmail: "owner@example.com" },
  workspaceId: "22222222-2222-4222-8222-222222222222",
  planWorkId: "33333333-3333-4333-8333-333333333333",
  planRevision: 1,
  outputId: "private-doc",
  operationId: "create_document",
  idempotencyKey: "plan-output-exit-test",
  inputDigest: "a".repeat(64),
  nativeProductId: "documents",
  nativeResourceKind: "document",
  nativeTitle: "Procedure",
  nativePayload: { title: "Procedure", content: "Review first." },
  nativeInput: {},
};

describe("work-plan output persistence errors", () => {
  it("maps an exited workspace to a non-retryable conflict", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "workspace_exit_future_work_blocked" } });

    await expect(persistWorkPlanOutput(input)).rejects.toMatchObject({
      name: "WorkspaceConflictError",
      message: "New work is stopped for this workspace. Existing records remain available for review.",
    });
  });
});
