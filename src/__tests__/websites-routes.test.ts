import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: null as null | { id: string; email: string; email_confirmed_at: string | null },
  release: true,
  createWebsite: vi.fn(),
  listWebsites: vi.fn(),
  readWebsite: vi.fn(),
  reviseWebsite: vi.fn(),
  approveWebsite: vi.fn(),
  prepareWebsiteLaunch: vi.fn(),
}));

vi.mock("@/lib/db/server-client", () => ({ getSessionUser: () => state.user }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => state.release }));
vi.mock("@/products/websites/server", () => ({
  createWebsite: state.createWebsite,
  listWebsites: state.listWebsites,
  readWebsite: state.readWebsite,
  reviseWebsite: state.reviseWebsite,
  approveWebsite: state.approveWebsite,
  prepareWebsiteLaunch: state.prepareWebsiteLaunch,
  WebsiteConflictError: class WebsiteConflictError extends Error {},
  WebsiteUnavailableError: class WebsiteUnavailableError extends Error {},
}));
const actor = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "owner@example.com", email_confirmed_at: "2026-09-20T00:00:00.000Z" };
const workspaceId = "11111111-1111-4111-8111-111111111111";
const workId = "22222222-2222-4222-8222-222222222222";
const candidateHash = "a".repeat(64);
const record = {
  workId,
  workspaceId,
  createdAt: "2026-09-20T12:00:00.000Z",
  updatedAt: "2026-09-20T12:01:00.000Z",
  website: {
    version: 1,
    revision: 1,
    title: "Alder & Pine",
    brief: { businessName: "Alder & Pine", description: "A florist", primaryCallToAction: "Contact us" },
    status: "preview_ready",
    candidate: { kind: "website_candidate", revision: 1, spec: { version: 1, siteName: "Alder & Pine", content: {}, pages: { home: { sections: [] } }, theme: {} }, contentHash: candidateHash, rendererDigest: "b".repeat(64), artifactDigest: "c".repeat(64), preview: { href: `/api/websites/${workId}/preview?revision=1&contentHash=${candidateHash}`, revision: 1, contentHash: candidateHash }, generatedAt: "2026-09-20T12:00:00.000Z" },
    approvedCandidateRevision: null,
    launch: { status: "not_requested", candidateRevision: null, receipt: null, failure: null },
    lastError: null,
    createdBy: actor.id,
    createdAt: "2026-09-20T12:00:00.000Z",
    history: [],
  },
};

beforeEach(() => {
  state.user = null;
  state.release = true;
  state.createWebsite.mockReset();
  state.listWebsites.mockReset();
  state.readWebsite.mockReset();
  state.reviseWebsite.mockReset();
  state.approveWebsite.mockReset();
  state.prepareWebsiteLaunch.mockReset();
  state.readWebsite.mockResolvedValue(record);
  state.listWebsites.mockResolvedValue([record]);
  state.createWebsite.mockResolvedValue(record);
  state.reviseWebsite.mockResolvedValue(record);
  state.approveWebsite.mockResolvedValue(record);
  state.prepareWebsiteLaunch.mockResolvedValue(record);
});

describe("website API boundary", () => {
  it("does not disclose website work before verified sign-in", async () => {
    const { GET } = await import("@/app/api/websites/route");
    const response = await GET(new Request(`http://localhost/api/websites?workspaceId=${workspaceId}`));
    expect(response.status).toBe(401);
    expect(state.listWebsites).not.toHaveBeenCalled();
  });

  it("keeps creation behind same-origin JSON and sends the canonical brief", async () => {
    state.user = actor;
    const { POST } = await import("@/app/api/websites/route");
    const crossSite = await POST(new Request("http://localhost/api/websites", { method: "POST", headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site", "content-type": "application/json" }, body: JSON.stringify({ action: "create", workspaceId, requestId: "website-route-1", brief: { businessName: "Alder & Pine", description: "A florist" } }) }));
    expect(crossSite.status).toBe(403);

    const sameOrigin = await POST(new Request("http://localhost/api/websites", { method: "POST", headers: { origin: "http://localhost", "sec-fetch-site": "same-origin", "content-type": "application/json" }, body: JSON.stringify({ action: "create", workspaceId, requestId: "website-route-1", brief: { businessName: "Alder & Pine", description: "A florist" } }) }));
    expect(sameOrigin.status).toBe(201);
    expect(state.createWebsite).toHaveBeenCalledWith(expect.objectContaining({ userId: actor.id }), workspaceId, expect.objectContaining({ requestId: "website-route-1", brief: expect.objectContaining({ businessName: "Alder & Pine", primaryCallToAction: "Contact us" }) }));
  });

  it("accepts the shell transport's root revise action without leaking route fields into the strict service input", async () => {
    state.user = actor;
    const { POST } = await import("@/app/api/websites/route");
    const response = await POST(new Request("http://localhost/api/websites", { method: "POST", headers: { origin: "http://localhost", "sec-fetch-site": "same-origin", "content-type": "application/json" }, body: JSON.stringify({ action: "revise", workId, expectedRevision: 1, brief: { businessName: "Alder & Pine", description: "A florist", primaryCallToAction: "Request flowers" } }) }));
    expect(response.status).toBe(200);
    expect(state.reviseWebsite).toHaveBeenCalledWith(expect.objectContaining({ userId: actor.id }), workId, { expectedRevision: 1, brief: expect.objectContaining({ primaryCallToAction: "Request flowers" }) });
  });

});
