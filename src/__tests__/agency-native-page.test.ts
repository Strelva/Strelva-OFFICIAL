import { describe, expect, it, vi } from "vitest";
import { composeAgencyNativePage, readAgencyPageChoices, sendAgencyNativePage } from "@/products/websites/agency-page-server";
import { siteDocumentSchema, siteDocumentHash } from "@/products/websites/site-document";
import { WorkspaceAccessError, WorkspaceConflictError } from "@/platform/workspaces/types";
import { websiteRebuildCandidate } from "@/products/websites/rebuild-possibility";
import { makeRealItem } from "@/platform/needs-you/sources/make-real";

vi.mock("@/platform/infra/redis", () => ({ getRedis: () => null }));
const actor = { userId: "61000000-0000-4000-8000-000000000001", verifiedEmail: "author@example.test" };
const agencyId = "61000000-0000-4000-8000-000000000002";
const workspaceId = "61000000-0000-4000-8000-000000000003";
const workId = "61000000-0000-4000-8000-000000000004";
const commandId = "61000000-0000-4000-8000-000000000005";
const document = () => siteDocumentSchema.parse({ version: 2, siteName: "Harbor Dental", theme: { palette: "light", typeScale: "standard" }, pages: [{ path: "/", title: "Home", description: "Home", root: "root" }], nodes: { root: { id: "root", type: "Section", variant: "container", props: {}, children: [], factIds: [] } }, facts: {}, assets: {}, redirects: [], provenance: { composer: "rules" }, capabilities: { baseUrl: "https://app.example.test", tenant: "harbor", inquiry: { capabilityId: "inquiries", version: 2 }, booking: { capabilityId: "visits", version: 1, range: { from: "2026-10-15T10:00:00Z", to: "2026-10-15T11:00:00Z" } } } });
const input = () => ({ workspaceId, workId, commandId, kind: "form" as const, expectedRevision: 3, candidateRevision: 2, candidateContentHash: siteDocumentHash(document()), title: "Get in touch", description: "Tell us what you need.", path: "/inquiry" });
const payload = () => ({ version: 2, revision: 3, title: "Harbor Dental", input: { requestId: "website-harbor", description: "Website", businessName: "Harbor Dental" }, status: "published", agencyPageOrigin: { kind: "agency", displayName: "Page Studio", agencyId, userId: actor.userId }, stages: [], checkpoint: null, candidate: { revision: 2, contentHash: siteDocumentHash(document()), document: document(), previewHref: `/api/websites/${workId}/preview` }, approvedCandidateRevision: 2, tenantId: "harbor", launch: { receipt: null, readBack: null }, lastError: null, createdBy: actor.userId, createdAt: "2026-10-01T12:00:00Z", history: [] });
const receipt = () => ({ workspaceId, workId, commandId, candidateRevision: 3, actor: { kind: "agency", displayName: "Page Studio", agencyId }, contentHash: "a".repeat(64), previewHref: `/api/websites/${workId}/preview` });

describe("scoped agency native pages", () => {
  it.each(["form", "booking"] as const)("composes a %s page without changing the existing site or connections", async kind => {
    const original = document(); const next = await composeAgencyNativePage(original, { ...input(), kind });
    expect(next.pages).toHaveLength(2); expect(next.pages[0]).toEqual(original.pages[0]);
    expect(next.capabilities).toEqual(original.capabilities); expect(next.nodes.root).toEqual(original.nodes.root);
    expect(Object.values(next.nodes).some(node => node.type === (kind === "form" ? "InquiryForm" : "Booking"))).toBe(true);
    expect(Object.values(next.facts).every(fact => fact.highRisk && fact.origin !== "owner_confirmed")).toBe(true);
    expect(original.pages).toHaveLength(1);
  });
  it("refuses missing same-site connections and duplicate page addresses", async () => {
    const missing = document(); delete missing.capabilities;
    await expect(composeAgencyNativePage(missing, input())).rejects.toBeInstanceOf(WorkspaceConflictError);
    const noBooking = document(); delete noBooking.capabilities!.booking;
    await expect(composeAgencyNativePage(noBooking, { ...input(), kind: "booking" })).rejects.toBeInstanceOf(WorkspaceConflictError);
    await expect(composeAgencyNativePage(document(), { ...input(), path: "/" })).rejects.toBeInstanceOf(WorkspaceConflictError);
  });
  it("checks the exact agency, business and verified actor for choice reads", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { workspaceId, choices: [] }, error: null });
    await readAgencyPageChoices(actor, agencyId, workspaceId, { rpc });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("read_agency_native_page_choices", { p_agency_workspace_id: agencyId, p_workspace_id: workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail });
  });
  it("denies before reading or composing when current authority is absent", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "agency_page_scope_required" } });
    await expect(sendAgencyNativePage(actor, agencyId, input(), { rpc })).rejects.toBeInstanceOf(WorkspaceAccessError);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("recovers the exact durable receipt before consulting a changed native website", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: receipt(), error: null });
    expect(await sendAgencyNativePage(actor, agencyId, input(), { rpc })).toEqual(receipt());
    expect(rpc).toHaveBeenCalledExactlyOnceWith("read_agency_native_page_command", expect.objectContaining({ p_input: input(), p_agency_workspace_id: agencyId }));
  });
  it("rejects a foreign recovery receipt", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ...receipt(), workspaceId: agencyId }, error: null });
    await expect(sendAgencyNativePage(actor, agencyId, input(), { rpc })).rejects.toThrow("receipt could not be confirmed");
  });
  it("writes only a review-ready candidate with exact source and command identity", async () => {
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === "read_agency_native_page_command") return { data: null, error: null };
      if (name === "read_agency_native_page_work") return { data: payload(), error: null };
      return { data: { ...receipt(), contentHash: args.p_content_hash }, error: null };
    });
    await sendAgencyNativePage(actor, agencyId, input(), { rpc });
    expect(rpc).toHaveBeenLastCalledWith("submit_agency_native_page", expect.objectContaining({ p_input: input(), p_payload: expect.objectContaining({ status: "review_ready", approvedCandidateRevision: null, revision: 4, candidate: expect.objectContaining({ revision: 3 }), history: [expect.objectContaining({ actorId: actor.userId, kind: "agency_document_draft" })] }) }));
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["read_agency_native_page_command", "read_agency_native_page_work", "submit_agency_native_page"]);
  });
  it("rejects a changed baseline before attempting persistence", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: { ...payload(), revision: 4 }, error: null });
    await expect(sendAgencyNativePage(actor, agencyId, input(), { rpc })).rejects.toBeInstanceOf(WorkspaceConflictError);
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("carries the recorded agency to the business review and decision source", () => {
    const candidate = websiteRebuildCandidate({ id: workId, productId: "websites", resourceKind: "website", payload: { ...payload(), status: "review_ready", history: [{ revision: 4, kind: "agency_document_draft", actorId: actor.userId, at: "2026-10-12T12:00:00Z" }] } });
    expect(candidate?.summary).toContain("Page Studio · Runs on Strelva");
    const item = makeRealItem({ possibilityId: "page", candidateRevision: 1, fingerprint: "a".repeat(64), title: "A form page", intent: "Review a proposed page", affects: [], introducesSystem: false, systemId: workId, actor: candidate?.actor }, workspaceId, []);
    expect(item?.actor).toMatchObject({ kind: "agency", displayName: "Page Studio", agencyId, userId: actor.userId });
  });
});
