import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ getSupabase: () => ({ rpc: mocks.rpc }) }));

const actor = { userId: "11111111-1111-4111-8111-111111111111", verifiedEmail: "owner@example.com" };
const brief = {
  version: 1 as const,
  id: "22222222-2222-4222-8222-222222222222",
  businessName: "Harbor Dental",
  request: "Follow up with every inquiry.",
  result: "Every inquiry has a next step.",
  resultTitle: "Inquiry follow-up brief",
  scope: "One source and one follow-up.",
  review: true,
  fileNames: ["notes.txt"],
};
const prepared = {
  continuationId: brief.id,
  title: brief.resultTitle,
  payload: { version: 1, title: brief.resultTitle, text: brief.request },
  input: { source: "public_session", businessName: brief.businessName },
};

describe("public continuation repository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the database idempotency boundary and preserves the same imported work on retry", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: [{ work_id: "33333333-3333-4333-8333-333333333333", workspace_id: "44444444-4444-4444-8444-444444444444", already_imported: false }], error: null })
      .mockResolvedValueOnce({ data: [{ work_id: "33333333-3333-4333-8333-333333333333", workspace_id: "44444444-4444-4444-8444-444444444444", already_imported: true }], error: null });
    const { importPublicContinuation } = await import("@/platform/public-continuations/repository");
    const first = await importPublicContinuation(actor, "44444444-4444-4444-8444-444444444444", prepared);
    const repeated = await importPublicContinuation(actor, "44444444-4444-4444-8444-444444444444", prepared);
    expect(first).toMatchObject({ workId: repeated.workId, alreadyImported: false });
    expect(repeated.alreadyImported).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("import_public_continuation", expect.objectContaining({
      p_continuation_id: brief.id,
      p_workspace_id: "44444444-4444-4444-8444-444444444444",
      p_user_id: actor.userId,
    }));
  });

  it("maps a different account or unauthorized workspace to access denied", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "continuation_unavailable" } });
    const { importPublicContinuation } = await import("@/platform/public-continuations/repository");
    const { WorkspaceAccessError } = await import("@/platform/workspaces");
    await expect(importPublicContinuation(actor, "44444444-4444-4444-8444-444444444444", prepared)).rejects.toBeInstanceOf(WorkspaceAccessError);
  });

  it("reads the exact imported destination through the current identity check", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ work_id: "33333333-3333-4333-8333-333333333333", workspace_id: "44444444-4444-4444-8444-444444444444" }], error: null });
    const { readPublicContinuationImport } = await import("@/platform/public-continuations/repository");
    await expect(readPublicContinuationImport(actor, brief.id)).resolves.toEqual({
      workId: "33333333-3333-4333-8333-333333333333",
      workspaceId: "44444444-4444-4444-8444-444444444444",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("read_public_continuation_import", {
      p_continuation_id: brief.id,
      p_user_id: actor.userId,
      p_verified_email: actor.verifiedEmail,
    });
  });
});
