import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(), rate: vi.fn(), score: vi.fn(), personal: vi.fn(), list: vi.fn(), work: vi.fn(), getWork: vi.fn(),
  save: vi.fn(), createAgency: vi.fn(), handoff: vi.fn(), inspect: vi.fn(), accept: vi.fn(),
  revoke: vi.fn(), cancel: vi.fn(), handoffs: vi.fn(), agencyDelegations: vi.fn(), workDelegations: vi.fn(),
  preflight: vi.fn(), runPrivate: vi.fn(), savePublicResult: vi.fn(), managedWork: vi.fn(),
}));
vi.mock("@/lib/db/server-client", () => ({ getSessionUser: mocks.user }));
vi.mock("@/lib/rate-limit", () => ({ isRateLimitedWindowedAsync: mocks.rate }));
vi.mock("@/products/ai-visibility/server", () => ({ runPrivateAiVisibilityAssessment: mocks.runPrivate, savePublicAiVisibilityResult: mocks.savePublicResult }));
vi.mock("@/products/managed-presence/server", () => ({ listManagedPresenceWork: mocks.managedWork }));
vi.mock("@/platform/workspaces", async () => {
  const types = await import("@/platform/workspaces/types");
  return { ...types, assertCanSaveWork: mocks.preflight, ensurePersonalWorkspace: mocks.personal, listWorkspaces: mocks.list,
    listWork: mocks.work, getWork: mocks.getWork, saveWork: mocks.save, createAgencyWorkspace: mocks.createAgency,
    createHandoff: mocks.handoff, inspectHandoff: mocks.inspect, acceptHandoff: mocks.accept,
    revokeDelegation: mocks.revoke, revokeHandoff: mocks.cancel, listAgencyHandoffs: mocks.handoffs,
    listAgencyDelegations: mocks.agencyDelegations, listWorkDelegations: mocks.workDelegations };
});

import { GET, POST } from "@/app/api/workspace/route";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError } from "@/platform/workspaces/types";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const workId = "22222222-2222-4222-8222-222222222222";
const otherId = "33333333-3333-4333-8333-333333333333";
const workspace = { id: workspaceId, kind: "personal", name: "My work", access: "member", role: "owner" };
const result = { business: "Example", score: 70, grade: "C", verdict: "Readiness signals found", topFix: "Add business schema",
  signals: [], citation: { probed: false, mentioned: false, recommended: false, note: "Not measured" } };
const work = { id: workId, workspaceId, title: "Example", productId: "ai_visibility", resourceKind: "ai_visibility_assessment",
  payload: result, input: {}, createdAt: "2026-09-05T00:00:00Z" };

function request(value: unknown, headers: Record<string, string> = {}) {
  return new Request("https://strelva.com/api/workspace", { method: "POST",
    headers: { origin: "https://strelva.com", "content-type": "application/json", ...headers }, body: JSON.stringify(value) });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  mocks.user.mockResolvedValue({ id: "actor", email: "OWNER@example.com", email_confirmed_at: "2026-09-05" });
  mocks.rate.mockResolvedValue(false);
  mocks.personal.mockResolvedValue(workspace);
  mocks.list.mockResolvedValue([workspace]);
  mocks.work.mockResolvedValue([work]);
  mocks.getWork.mockResolvedValue(work);
  mocks.save.mockResolvedValue(work);
  mocks.score.mockResolvedValue(result);
  mocks.preflight.mockResolvedValue(undefined);
  mocks.runPrivate.mockImplementation(async ({ actor, workspaceId, input }: {
    actor: { userId: string; verifiedEmail: string };
    workspaceId: string;
    input: Record<string, unknown>;
  }) => {
    const selected = (await mocks.list(actor)).find((item: { id: string; access: string }) => item.id === workspaceId && item.access === "member");
    if (!selected) throw new WorkspaceAccessError();
    await mocks.preflight(actor, workspaceId);
    if (await mocks.rate(`workspace:assessment:${actor.userId}`, 10, 86_400_000)) {
      const error = new Error("daily limit");
      error.name = "PrivateAiVisibilityAssessmentRateLimitError";
      throw error;
    }
    const scored = await mocks.score(input);
    return mocks.save(actor, workspaceId, { productId: "ai_visibility", resourceKind: "ai_visibility_assessment", title: String(input.business), payload: scored, input });
  });
  mocks.savePublicResult.mockResolvedValue({ work, created: true });
  mocks.handoffs.mockResolvedValue([]);
  mocks.agencyDelegations.mockResolvedValue([]);
  mocks.workDelegations.mockResolvedValue([]);
  mocks.managedWork.mockResolvedValue({ managedWork: [], unavailable: false });
});

describe("release-one private workspace routes", () => {
  it("fails closed while the release gate is off", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "0");
    expect((await GET(new Request("https://strelva.com/api/workspace"))).status).toBe(503);
    expect((await POST(request({ action: "create_agency", name: "Example" }))).status).toBe(503);
    expect(mocks.user).not.toHaveBeenCalled();
  });
  it.each([null, { id: "actor", email: "unverified@example.com" }])("requires a verified session", async (user) => {
    mocks.user.mockResolvedValue(user);
    expect((await GET(new Request("https://strelva.com/api/workspace"))).status).toBe(401);
    expect(mocks.personal).not.toHaveBeenCalled();
  });
  it("loads a no-tenant person's private work without tenant or billing authority", async () => {
    const response = await GET(new Request("https://strelva.com/api/workspace"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ workspaceId, work: [{ id: workId }], actor: { email: "owner@example.com" } });
    expect(mocks.work).toHaveBeenCalledWith({ userId: "actor", verifiedEmail: "owner@example.com" }, workspaceId);
  });
  it("includes authorized managed websites as tenant links without cloning saved work", async () => {
    mocks.managedWork.mockResolvedValue({ managedWork: [{ id: "gldf", title: "Great Lakes Dried Fruit", href: "https://app.strelva.com/client/gldf/dashboard", productId: "managed_presence", relationship: "client" }], unavailable: false });

    const response = await GET(new Request("https://strelva.com/api/workspace"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ managedWork: [{ id: "gldf", productId: "managed_presence", relationship: "client" }] });
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("keeps unrelated private work available when managed discovery is unavailable", async () => {
    mocks.managedWork.mockRejectedValue(new Error("tenant store unavailable"));

    const response = await GET(new Request("https://strelva.com/api/workspace"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ workspaceId, work: [{ id: workId }], managedWork: [], managedWorkUnavailable: true });
  });
  it("propagates only the browser-safe managed-work projection and bounded availability", async () => {
    mocks.managedWork.mockResolvedValue({
      managedWork: [{
        id: "tenant-gldf",
        title: "Great Lakes Dried Fruit",
        href: "https://app.strelva.com/client/gldf/dashboard",
        productId: "managed_presence",
        relationship: "client",
        operatorToken: "must-not-leak",
      }],
      unavailable: true,
    });

    const response = await GET(new Request("https://strelva.com/api/workspace"));
    expect(response.status).toBe(200);
    const output = await response.json();
    expect(output.managedWork).toEqual([{
      id: "tenant-gldf",
      title: "Great Lakes Dried Fruit",
      href: "https://app.strelva.com/client/gldf/dashboard",
      productId: "managed_presence",
      relationship: "client",
    }]);
    expect(output.managedWorkUnavailable).toBe(true);
    expect(JSON.stringify(output)).not.toContain("token");
  });
  it("does not disclose another workspace's contents", async () => {
    const response = await GET(new Request(`https://strelva.com/api/workspace?workspaceId=${otherId}`));
    expect(response.status).toBe(404);
    expect(mocks.work).not.toHaveBeenCalled();
  });
  it("rejects cross-origin and missing-origin mutations", async () => {
    for (const origin of ["https://attacker.example", ""]) {
      expect((await POST(request({ action: "create_agency", name: "Example" }, { origin }))).status).toBe(403);
    }
    expect(mocks.createAgency).not.toHaveBeenCalled();
  });
  it("rejects non-JSON and oversized payloads", async () => {
    expect((await POST(request({}, { "content-type": "text/plain" }))).status).toBe(415);
    expect((await POST(request({ action: "create_agency", name: "x".repeat(13000) }))).status).toBe(400);
    expect(mocks.createAgency).not.toHaveBeenCalled();
  });
  it("rejects browser-selected product execution and forged results", async () => {
    expect((await POST(request({ action: "assess", workspaceId, business: "Example", productId: "homefinder", payload: result }))).status).toBe(400);
    expect(mocks.score).not.toHaveBeenCalled();
  });
  it("keeps unenabled products unavailable and foreign work from breaking the list", async () => {
    mocks.work.mockResolvedValue([work, { ...work, id: otherId, productId: "homefinder", payload: { privateData: "not sent" } }]);
    const response = await GET(new Request("https://strelva.com/api/workspace"));
    expect(response.status).toBe(200);
    const output = await response.json();
    expect(output.work[1].payload).toBeNull();
    expect(output.products.find((product: { id: string }) => product.id === "homefinder").availability).toBe("not_enabled");
    expect(output.products.find((product: { id: string }) => product.id === "domain_monitoring")).toBeUndefined();
  });
  it("authorizes workspace writes before incurring scoring cost", async () => {
    mocks.list.mockResolvedValue([{ ...workspace, access: "delegated_read" }]);
    expect((await POST(request({ action: "assess", workspaceId, business: "Example" }))).status).toBe(403);
    expect(mocks.score).not.toHaveBeenCalled();
  });
  it("enforces the per-user daily budget before scoring", async () => {
    mocks.rate.mockImplementation(async (key: string) => key.startsWith("workspace:assessment:"));
    expect((await POST(request({ action: "assess", workspaceId, business: "Example" }))).status).toBe(429);
    expect(mocks.score).not.toHaveBeenCalled();
  });
  it("checks persistence capacity before spending on an assessment", async () => {
    mocks.preflight.mockRejectedValue(new WorkspaceConflictError());
    expect((await POST(request({ action: "assess", workspaceId, business: "Example" }))).status).toBe(409);
    expect(mocks.score).not.toHaveBeenCalled();
  });
  it("stores server-produced results privately without using the public result saver", async () => {
    const response = await POST(request({ action: "assess", workspaceId, business: "Example" }));
    expect(response.status).toBe(201);
    expect(mocks.save).toHaveBeenCalledWith(expect.any(Object), workspaceId,
      expect.objectContaining({ productId: "ai_visibility", payload: result }));
    const output = await response.json();
    expect(output).not.toHaveProperty("shareUrl");
    expect(output.work.id).toBe(workId);
  });
  it("imports a retained public result only through the explicit private-copy action", async () => {
    const response = await POST(request({ action: "save_public_result", workspaceId, resultId: "scan_abc123" }));
    expect(response.status).toBe(201);
    expect(mocks.savePublicResult).toHaveBeenCalledWith({
      actor: { userId: "actor", verifiedEmail: "owner@example.com" },
      workspaceId,
      resultId: "scan_abc123",
    });
    expect(await response.json()).toMatchObject({ work: { id: workId }, alreadySaved: false });
  });
  it("keeps retained-result failures honest at the HTTP boundary", async () => {
    const unavailable = new Error("internal retained-result details");
    unavailable.name = "PublicAiVisibilityResultUnavailableError";
    mocks.savePublicResult.mockRejectedValueOnce(unavailable);
    const unavailableResponse = await POST(request({ action: "save_public_result", workspaceId, resultId: "scan_abc123" }));
    expect(unavailableResponse.status).toBe(404);
    expect(await unavailableResponse.json()).toEqual({ error: "That public scorecard is no longer available to save." });

    const limited = new Error("internal limiter details");
    limited.name = "PublicAiVisibilityImportRateLimitError";
    mocks.savePublicResult.mockRejectedValueOnce(limited);
    const limitedResponse = await POST(request({ action: "save_public_result", workspaceId, resultId: "scan_abc123" }));
    expect(limitedResponse.status).toBe(429);
    expect(await limitedResponse.json()).toEqual({ error: "You've reached the daily saved-result limit. Try again tomorrow." });
  });
  it("does not report a successful save when storage fails", async () => {
    mocks.save.mockRejectedValue(new WorkspaceStoreError("database secret details"));
    const response = await POST(request({ action: "assess", workspaceId, business: "Example" }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret");
  });
  it("creates a recipient-bound handoff, returning the token only at creation", async () => {
    mocks.handoff.mockResolvedValue({ token: "opaque-once", handoff: { tokenHash: "secret-hash" } });
    const response = await POST(request({ action: "handoff", workId, recipientEmail: "client@example.com" }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ token: "opaque-once" });
  });
  it("uses a POST body to inspect handoffs and returns only the approved preview", async () => {
    mocks.inspect.mockResolvedValue({ recipientEmail: "owner@example.com", agencyWorkspace: { name: "Agency" }, work, status: "pending", expiresAt: "2026-09-12" });
    const response = await POST(request({ action: "inspect_handoff", token: "opaque-once" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ agencyName: "Agency", work: { id: workId } });
  });
  it("rejects wrong-recipient preview without leaking work", async () => {
    mocks.inspect.mockRejectedValue(new WorkspaceAccessError());
    const response = await POST(request({ action: "inspect_handoff", token: "opaque-once" }));
    expect(response.status).toBe(403);
    expect(await response.json()).not.toHaveProperty("work");
  });
  it("requires explicit agency-access consent and passes false without promotion", async () => {
    expect((await POST(request({ action: "accept_handoff", token: "opaque" }))).status).toBe(400);
    mocks.accept.mockResolvedValue({ customerWorkspaceId: workspaceId, customerWorkId: workId });
    expect((await POST(request({ action: "accept_handoff", token: "opaque", allowAgencyAccess: false }))).status).toBe(200);
    expect(mocks.accept).toHaveBeenCalledWith(expect.any(Object), "opaque", false);
  });
  it("does not turn a failed revocation into success", async () => {
    mocks.revoke.mockResolvedValue(false);
    expect((await POST(request({ action: "revoke_delegation", delegationId: otherId }))).status).toBe(403);
  });
  it("does not expose invitation hashes in agency snapshots", async () => {
    mocks.list.mockResolvedValue([{ ...workspace, kind: "agency" }]);
    mocks.handoffs.mockResolvedValue([{ id: otherId, sourceWorkId: workId, recipientEmail: "client@example.com", status: "pending", tokenHash: "must-not-leak" }]);
    const response = await GET(new Request("https://strelva.com/api/workspace"));
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain("must-not-leak");
  });
});
