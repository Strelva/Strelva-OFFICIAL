import { describe, it, expect, vi } from "vitest";
import { createAgentWebsiteAdapter } from "@/products/websites/agent-adapter";
import { siteDocumentSchema, siteDocumentHash } from "@/products/websites/site-document";
import { websiteRebuildSchema } from "@/products/websites/rebuild-contracts";
import { prepareSitePatch } from "@/products/websites/site-operations";
const workspaceId = "81000000-0000-4000-8000-000000000001";
const workId = "81000000-0000-4000-8000-000000000002";
const userId = "81000000-0000-4000-8000-000000000003";
const requestId = "81000000-0000-4000-8000-000000000004";
const at = "2026-10-08T12:00:00Z";
const auth = { workspaceId, userId, tokenHash: "a".repeat(64), resource: "https://app.strelva.com/api/mcp/public" };
function fixture() {
 const document = siteDocumentSchema.parse({ version: 2, siteName: "Synthetic firm", theme: { palette: "light", typeScale: "standard" }, pages: [{ path: "/", title: "Firm", description: "", root: "hero" }], nodes: { hero: { id: "hero", type: "Hero", variant: "statement", props: { title: "Original headline", body: "Original body" }, children: [], factIds: [] } }, facts: {}, assets: {}, redirects: [], provenance: { composer: "rules", sourceUrl: "https://private-source.example.test/secret" } });
 const rebuild = websiteRebuildSchema.parse({ version: 2, revision: 3, title: "Synthetic firm", input: { requestId: "fixture-request", url: "https://private-source.example.test/secret" }, status: "approved", stages: [], checkpoint: { privateKey: "private-checkpoint" }, lastError: null, candidate: { revision: 2, contentHash: siteDocumentHash(document), document, previewHref: `/api/websites/${workId}/preview` }, approvedCandidateRevision: 2, tenantId: null, launch: { receipt: null, readBack: null }, createdBy: userId, createdAt: at, history: [] });
 const snapshot = { work: { id: workId, workspace_id: workspaceId, product_id: "websites", resource_kind: "website", payload: rebuild }, documentRevision: 2, contentHash: rebuild.candidate!.contentHash, approvedRevision: 2, publishedRevision: 1 };
 const receipt = { requestId, websiteWorkId: workId, revision: 3, contentHash: "b".repeat(64), currentRevision: 3, currentContentHash: "b".repeat(64), summary: "New headline", createdAt: at, status: "awaiting_review" };
 const rpc = vi.fn(async (name: string, _args: Record<string,unknown>): Promise<unknown> => name === "read_agent_website_proposal_retry" ? null : name === "read_agent_website_work" ? snapshot : receipt);
 const service = createAgentWebsiteAdapter(rpc, "https://app.strelva.com", () => at);
 const request = { websiteWorkId: workId, requestId, expectedRevision: 3, candidateRevision: 2, candidateContentHash: snapshot.contentHash, summary: "New headline", ops: [{ op: "replace", path: "/nodes/hero/props/title", value: "Proposed headline" }] };
 return { document, rebuild, snapshot, receipt, rpc, service, request };
}
describe("native assistant website work", () => {
 it("reads selected page graph and version identities without private source/checkpoint data", async () => {
  const h = fixture(); const value = await h.service.call("read_website", { websiteWorkId: workId, page: "/" }, auth);
  expect(value).toMatchObject({ expectedRevision: 3, candidateRevision: 2, approvedRevision: 2, publishedRevision: 1 });
  for (const privateValue of ["private-source", "private-checkpoint", "provenance", "launch", "createdBy"]) expect(JSON.stringify(value)).not.toContain(privateValue);
 });
 it("saves a new owner-reviewed native candidate, clears approval and returns existing review route", async () => {
  const h = fixture(); const value = await h.service.call("propose_website_change", h.request, auth);
  expect(value).toMatchObject({ liveSiteChanged: false, status: "awaiting_review" });
  expect(value).toHaveProperty("reviewHref", expect.stringContaining(`work=${workId}`));
  expect(h.rpc).toHaveBeenCalledWith("read_agent_website_work", expect.objectContaining({ p_scope: "website:propose" }));
  const args = h.rpc.mock.calls.find(([name]) => name === "commit_agent_website_candidate")![1];
  const payload = websiteRebuildSchema.parse(args.p_payload);
  expect(payload).toMatchObject({ revision: 4, status: "review_ready", approvedCandidateRevision: null, checkpoint: null, audit: null, candidate: { revision: 3 } });
  expect(payload.candidate!.document.nodes.hero!.verification!.needsReview).toBe(true);
  expect(payload.history.at(-1)).toMatchObject({ kind: "agent_document_proposal", actorId: userId });
  expect(h.rebuild.status).toBe("approved");
 });
 it("returns existing retry receipt before applying a now-stale baseline", async () => {
  const h = fixture(); h.rpc.mockResolvedValueOnce(h.receipt);
  expect(await h.service.call("propose_website_change", { ...h.request, candidateRevision: 1 }, auth)).toMatchObject({ requestId });
  expect(h.rpc).toHaveBeenCalledOnce();
 });
 it.each(["work revision", "document revision", "hash"])("rejects stale %s before writing", async reason => {
  const h = fixture(); const request = { ...h.request, ...(reason === "work revision" ? { expectedRevision: 2 } : reason === "document revision" ? { candidateRevision: 1 } : { candidateContentHash: "a".repeat(64) }) };
  await expect(h.service.call("propose_website_change", request, auth)).rejects.toThrow("revision_conflict");
  expect(h.rpc.mock.calls.some(([name]) => name.startsWith("commit"))).toBe(false);
 });
 it("rejects wrong-workspace results, malformed patch, evidence writes and no-op patches", async () => {
  const h = fixture(); h.snapshot.work.workspace_id = userId;
  await expect(h.service.call("read_website", { websiteWorkId: workId }, auth)).rejects.toThrow("revision_conflict");
  h.snapshot.work.workspace_id = workspaceId;
  for (const ops of [[{ op: "replace", path: "/facts/private", value: "bad" }], [{ op: "replace", path: "/nodes/hero/verification", value: { supported: true } }], [{ op: "replace", path: "/nodes/hero/props/title", value: "Original headline" }]]) await expect(h.service.call("propose_website_change", { ...h.request, ops }, auth)).rejects.toThrow();
  expect(h.rpc.mock.calls.some(([name]) => name.startsWith("commit"))).toBe(false);
 });
 it("preserves previous owner-confirmed facts when repeated copy needs fresh review", async () => {
  const h = fixture(); const previous = await prepareSitePatch({ document: h.document, ops: h.request.ops, forceReview: true });
  for (const fact of Object.values(previous.document.facts)) fact.origin = "owner_confirmed";
  h.rebuild.candidate!.document = previous.document; h.rebuild.candidate!.contentHash = siteDocumentHash(previous.document); h.snapshot.contentHash = h.rebuild.candidate!.contentHash;
  await h.service.call("propose_website_change", { ...h.request, candidateContentHash: h.snapshot.contentHash, ops: [{ op: "replace", path: "/nodes/hero/props/body", value: "New body" }] }, auth);
  const args = h.rpc.mock.calls.find(([name]) => name === "commit_agent_website_candidate")![1]; const payload = websiteRebuildSchema.parse(args.p_payload);
  for (const [id, fact] of Object.entries(previous.document.facts)) expect(payload.candidate!.document.facts[id]).toEqual(fact);
 });
 it("explains superseded exact revisions while exposing the current owner-reviewed candidate", async () => {
  const h = fixture();
  h.rpc.mockResolvedValueOnce([{ ...h.receipt, status: "superseded", currentRevision: 4, currentContentHash: "c".repeat(64) }]);
  const result = await h.service.call("list_website_proposals", { websiteWorkId: workId }, auth);
  expect(result).toMatchObject({ proposals: [{ revision: 3, contentHash: "b".repeat(64), currentRevision: 4, currentContentHash: "c".repeat(64), status: "superseded" }] });
  expect(JSON.stringify(result)).toContain("superseded does not mean rejected");
  expect(JSON.stringify(result)).toContain("Owner fact review");
 });
 it("propagates transactional revocation after preparation without reporting success", async () => {
  const h = fixture(); h.rpc.mockImplementation(async name => { if (name === "read_agent_website_proposal_retry") return null; if (name === "read_agent_website_work") return h.snapshot; throw new Error("oauth_invalid_token"); });
  await expect(h.service.call("propose_website_change", h.request, auth)).rejects.toThrow("oauth_invalid_token");
 });
});
