import { describe, expect, it, vi } from "vitest";
import { WORKSPACE_EXIT_STOPPED_MESSAGE, WorkspaceConflictError } from "@/platform/workspaces/types";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const sourceWorkId = "22222222-2222-4222-8222-222222222222";
const actor = { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", verifiedEmail: "staff@example.test" };

vi.mock("@/lib/db/client", () => ({
  getSupabase: () => ({
    rpc: async () => ({ data: null, error: { message: "workspace_exit_future_work_blocked" } }),
  }),
}));
vi.mock("@/lib/db/repositories", () => ({ isSuperAdminUser: async () => true }));
vi.mock("@/platform/workspaces/repository", () => ({
  assertWorkspaceMember: async () => undefined,
  getWork: async () => ({
    id: sourceWorkId, workspaceId, productId: "documents", resourceKind: "document", title: "Notes",
    payload: {}, createdBy: actor.userId, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
  }),
}));

const { createWorkspaceLearning } = await import("@/products/product-learning/server");

describe("product learning after workspace exit", () => {
  it("reports that new work is stopped instead of a generic store error", async () => {
    const attempt = createWorkspaceLearning(actor, workspaceId, {
      title: "Front desk research",
      objective: "Learn what slows check-in",
      sources: [{ id: "source-1", workId: sourceWorkId, segment: "front desk", freshForHours: 24 }],
      intervalHours: 24,
      budgetCents: 0,
    });
    await expect(attempt).rejects.toBeInstanceOf(WorkspaceConflictError);
    await expect(attempt).rejects.toThrow(WORKSPACE_EXIT_STOPPED_MESSAGE);
  });
});
