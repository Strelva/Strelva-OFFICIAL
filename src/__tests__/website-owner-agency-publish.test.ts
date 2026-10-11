import { describe, expect, it, vi } from "vitest";
import { createWebsiteDocumentStore } from "@/products/websites/document-store";
import { fixtureSiteDocument } from "@/experience/websites/rebuild-fixture";
import { siteDocumentHash } from "@/products/websites/site-document";
import { WorkspaceAccessError, WorkspaceConflictError } from "@/platform/workspaces/types";
import { serverRebuildTransport } from "@/experience/websites/rebuild-transport";
import { fixtureRebuild } from "@/experience/websites/rebuild-fixture";

const actor = { userId: "71000000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" };
const key = { workspaceId: "71000000-0000-4000-8000-000000000002", workId: "71000000-0000-4000-8000-000000000003" };
const agencyWorkspaceId = "71000000-0000-4000-8000-000000000004";
const document = structuredClone(fixtureSiteDocument);
document.facts = {};
for (const node of Object.values(document.nodes)) { node.factIds = []; delete node.verification; }
const contentHash = siteDocumentHash(document);
const candidate = { ...key, revision: 1, contentHash };
const row = { workspace_id: key.workspaceId, website_work_id: key.workId, revision: 1, content_hash: contentHash, document, created_by: actor.userId, created_at: "2026-10-07T12:00:00Z" };

describe("explicit owner website publishing permission", () => {
  it("keeps default approval free of a resource grant", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [row], error: null }).mockResolvedValueOnce({ data: null, error: null });
    await createWebsiteDocumentStore({ rpc }).approve(actor, candidate);
    expect(rpc).toHaveBeenLastCalledWith("approve_website_document", expect.not.objectContaining({ p_agency_workspace_id: expect.anything() }));
  });
  it("passes exact candidate and displayed agency to one atomic RPC", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [row], error: null }).mockResolvedValueOnce({ data: null, error: null });
    await createWebsiteDocumentStore({ rpc }).approve(actor, { ...candidate, agencyWorkspaceId });
    expect(rpc).toHaveBeenLastCalledWith("approve_website_document_for_agency", { p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_workspace_id: key.workspaceId, p_work_id: key.workId, p_revision: 1, p_content_hash: contentHash, p_agency_workspace_id: agencyWorkspaceId });
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it.each([ ["provider_seat_owner_required", WorkspaceAccessError], ["website_agency_provider_changed", WorkspaceConflictError], ["provider_seat_required", WorkspaceConflictError], ["website_revision_conflict", WorkspaceConflictError] ])("retains refusal of %s", async (message, errorType) => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [row], error: null }).mockResolvedValueOnce({ data: null, error: { message } });
    await expect(createWebsiteDocumentStore({ rpc }).approve(actor, { ...candidate, agencyWorkspaceId })).rejects.toBeInstanceOf(errorType);
  });
  it("accepts only the scoped permission read, including no permission for nonowners", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: { agencyWorkspaceId, agencyName: "Workflow Agency", granted: false }, error: null }).mockResolvedValueOnce({ data: null, error: null });
    const store = createWebsiteDocumentStore({ rpc });
    await expect(store.agencyPublishPermission!(actor, key)).resolves.toEqual({ agencyWorkspaceId, agencyName: "Workflow Agency", granted: false });
    await expect(store.agencyPublishPermission!(actor, key)).resolves.toBeNull();
    expect(rpc).toHaveBeenLastCalledWith("read_website_agency_publish_permission", { p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_workspace_id: key.workspaceId, p_work_id: key.workId });
  });
  it("sends agency consent only with explicit opt-in", async () => {
    const fetchMock = vi.fn(async (_path: string, _init?: RequestInit) => new Response(JSON.stringify({ error: "Denied" }), { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const record = fixtureRebuild();
      await expect(serverRebuildTransport.mutate(record, "approve", { allowAgencyPublish: true, agencyWorkspaceId })).rejects.toThrow("Denied");
      expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toMatchObject({ allowAgencyPublish: true, agencyWorkspaceId, candidateContentHash: record.candidate!.contentHash });
      await expect(serverRebuildTransport.mutate(record, "approve", { allowAgencyPublish: false, agencyWorkspaceId })).rejects.toThrow("Denied");
      expect(JSON.parse(String(fetchMock.mock.calls[1]![1]!.body))).not.toHaveProperty("allowAgencyPublish");
      expect(JSON.parse(String(fetchMock.mock.calls[1]![1]!.body))).not.toHaveProperty("agencyWorkspaceId");
    } finally { vi.unstubAllGlobals(); }
  });
});
