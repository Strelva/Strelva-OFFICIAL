import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ user: null as null | { id: string; email: string; email_confirmed_at: string | null }, release: true }));
const onboarding = vi.hoisted(() => ({
  createOnboardingCase: vi.fn(),
  attachExistingOnboardingDocument: vi.fn(),
  listOnboardingAttachableDocuments: vi.fn(),
  listOnboardingCases: vi.fn(),
  readOnboardingCase: vi.fn(),
  readOnboardingUpload: vi.fn(),
  readOnboardingOriginalFile: vi.fn(),
  assignOnboardingCase: vi.fn(),
  reviewOnboardingRequirement: vi.fn(),
  requestOnboardingCorrection: vi.fn(),
  acceptOnboardingRequirement: vi.fn(),
  uploadOnboardingFile: vi.fn(),
}));
vi.mock("@/lib/db/server-client", () => ({ getSessionUser: () => state.user }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => state.release }));
vi.mock("@/products/onboarding/server", () => onboarding);

const actor = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "owner@example.com", email_confirmed_at: "2026-09-20T00:00:00.000Z" };
const workspaceId = "11111111-1111-4111-8111-111111111111";
const caseId = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  state.user = null;
  state.release = true;
  Object.values(onboarding).forEach((mock) => mock.mockReset());
});

describe("onboarding API boundary", () => {
  it("does not disclose private cases before verified sign-in", async () => {
    const { GET } = await import("@/app/api/onboarding/route");
    const response = await GET(new Request(`http://localhost/api/onboarding?workspaceId=${workspaceId}`));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Sign in to open onboarding." });
  });

  it("keeps case creation and review actions behind same-origin JSON", async () => {
    state.user = actor;
    const created = { workId: caseId, workspaceId, case: { title: "Customer onboarding" } };
    onboarding.createOnboardingCase.mockResolvedValue(created);
    const { POST } = await import("@/app/api/onboarding/route");
    const crossSite = await POST(new Request("http://localhost/api/onboarding", { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example", "sec-fetch-site": "cross-site" }, body: JSON.stringify({ action: "create", input: {} }) }));
    expect(crossSite.status).toBe(403);
    const sameOrigin = await POST(new Request("http://localhost/api/onboarding", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost", "sec-fetch-site": "same-origin" }, body: JSON.stringify({ action: "create", input: { workspaceId, title: "Customer onboarding" } }) }));
    expect(sameOrigin.status).toBe(201);
    expect(onboarding.createOnboardingCase).toHaveBeenCalledWith(expect.objectContaining({ userId: actor.id }), { workspaceId, title: "Customer onboarding" });
  });

  it("requires multipart upload input and leaves the case unchanged on malformed requests", async () => {
    state.user = actor;
    const { POST } = await import("@/app/api/onboarding/upload/route");
    const response = await POST(new Request("http://localhost/api/onboarding/upload", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost", "sec-fetch-site": "same-origin" }, body: JSON.stringify({ workspaceId, caseId }) }));
    expect(response.status).toBe(415);
    expect(onboarding.uploadOnboardingFile).not.toHaveBeenCalled();
  });

  it("returns an authorized original attachment with private download headers", async () => {
    state.user = actor;
    const bytes = Buffer.from("%PDF-1.4 synthetic evidence");
    onboarding.readOnboardingOriginalFile.mockResolvedValue({
      workId: "33333333-3333-4333-8333-333333333333",
      workspaceId,
      bytes,
      provenance: {
        source: "upload",
        storageBoundary: "saved_product_work",
        storageKey: "onboarding-upload:test",
        originalName: "identity proof.pdf",
        contentType: "application/pdf",
        size: bytes.length,
        sha256: "a".repeat(64),
        uploadedAt: "2026-09-20T00:00:00.000Z",
      },
    });
    const { GET } = await import("@/app/api/onboarding/file/route");
    const response = await GET(new Request("http://localhost/api/onboarding/file?workId=33333333-3333-4333-8333-333333333333"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-length")).toBe(String(bytes.length));
    expect(response.headers.get("content-disposition")).toContain('attachment; filename="identity proof.pdf"');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  });

  it("does not disclose an original attachment before verified sign-in", async () => {
    const { GET } = await import("@/app/api/onboarding/file/route");
    const response = await GET(new Request("http://localhost/api/onboarding/file?workId=33333333-3333-4333-8333-333333333333"));
    expect(response.status).toBe(401);
    expect(onboarding.readOnboardingOriginalFile).not.toHaveBeenCalled();
  });
});
