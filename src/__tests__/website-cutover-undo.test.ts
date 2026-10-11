import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWebsiteDocumentStore } from "@/products/websites/document-store";
import { WorkspaceAccessError, WorkspaceConflictError } from "@/platform/workspaces/types";

vi.mock("@/products/websites/system-releases", () => ({ observeWebsiteWorkRelease: vi.fn() }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => null }));
const actor = { userId: "62000000-0000-4000-8000-000000000101", verifiedEmail: "owner@example.test" };
const input = { workspaceId: "62000000-0000-4000-8000-000000000110", workId: "62000000-0000-4000-8000-000000000111", tenantId: "linked-client", revision: 2, contentHash: "a".repeat(64), commandId: "62000000-0000-4000-8000-000000000112", domainRestored: true, fallbackVerified: true };

describe("rebuild cutover undo persistence boundary", () => {
  beforeEach(() => vi.clearAllMocks());
  it("passes the owner, pinned release and explicit fallback confirmations to the authority RPC", async () => {
    const receipt = { kind: "rebuild_cutover_undone", receiptId: input.commandId };
    const rpc = vi.fn(async () => ({ data: receipt, error: null }));
    await expect(createWebsiteDocumentStore({ rpc }).undoLinkedCutover!(actor, input)).resolves.toEqual(receipt);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("undo_website_linked_cutover", expect.objectContaining({ p_user_id: actor.userId, p_work_id: input.workId, p_revision: 2, p_content_hash: input.contentHash, p_command_id: input.commandId, p_domain_restored: true, p_fallback_verified: true }));
  });
  it.each(["workspace_access_denied", "website_tenant_not_linked"])("refuses %s instead of returning a receipt", async message => {
    const rpc = vi.fn(async () => ({ data: null, error: { message } }));
    await expect(createWebsiteDocumentStore({ rpc }).undoLinkedCutover!(actor, input)).rejects.toBeInstanceOf(WorkspaceAccessError);
    expect(rpc).toHaveBeenCalledOnce();
  });
  it.each(["website_fallback_unavailable", "website_fallback_confirmation_required", "website_revision_conflict"])("reports %s without retrying the write", async message => {
    const rpc = vi.fn(async () => ({ data: null, error: { message } }));
    await expect(createWebsiteDocumentStore({ rpc }).undoLinkedCutover!(actor, input)).rejects.toBeInstanceOf(WorkspaceConflictError);
    expect(rpc).toHaveBeenCalledOnce();
  });
  it("rejects malformed identity before reaching SQL", async () => {
    const rpc = vi.fn(async () => ({ data: {}, error: null }));
    await expect(createWebsiteDocumentStore({ rpc }).undoLinkedCutover!(actor, { ...input, commandId: "bad" })).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
});
