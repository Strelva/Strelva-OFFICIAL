import { expect, it, vi } from "vitest";
import { WorkspaceConflictError, WorkspaceStoreError } from "@/platform/workspaces/types";
import { websiteRebuildSchema } from "@/products/websites/rebuild-contracts";
import { harness, actor, selection } from "./rebuild-recovery-independent-harness";

it("selector peer actual service keeps the memory-port commit when acknowledgement is lost and rejects stale repeat", async () => {
 vi.stubGlobal("fetch", vi.fn(async () => { throw Error("Outside transport forbidden in this probe"); }));
 const h = harness(); const reviewed = await h.create(); const approved = await h.service.approve(actor, reviewed.workId, selection(reviewed));
 const commit = vi.mocked(h.documents.commitCandidate).getMockImplementation()!; let lost = false;
 const candidate = vi.spyOn(h.documents, "commitCandidate").mockImplementation(async (user, input) => { const saved = await commit(user, input); if (!lost) { lost = true; throw new WorkspaceStoreError("Acknowledgement lost after memory-port commit"); } return saved; });
 candidate.mockClear();
 await expect(h.service.connectCapabilities(actor, approved.workId, { expectedRevision: approved.rebuild.revision, selection: null })).rejects.toBeInstanceOf(WorkspaceStoreError);
 const committed = websiteRebuildSchema.parse(h.works.get(approved.workId)!.payload);
 expect(committed.revision).toBe(approved.rebuild.revision + 1); expect(committed.status).toBe("review_ready"); expect(committed.approvedCandidateRevision).toBeNull();
 expect(candidate).toHaveBeenCalledTimes(1);
 await expect(h.service.connectCapabilities(actor, approved.workId, { expectedRevision: approved.rebuild.revision, selection: null })).rejects.toBeInstanceOf(WorkspaceConflictError);
 expect(candidate).toHaveBeenCalledTimes(1); expect(vi.mocked(fetch)).not.toHaveBeenCalled(); vi.unstubAllGlobals();
});
