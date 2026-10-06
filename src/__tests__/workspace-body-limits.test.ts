import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ user: null as null | { id: string; email: string; email_confirmed_at: string | null } }));
const onboarding = vi.hoisted(() => ({
  createOnboardingCase: vi.fn(),
  attachExistingOnboardingDocument: vi.fn(),
  listOnboardingAttachableDocuments: vi.fn(),
  listOnboardingCases: vi.fn(),
  readOnboardingCase: vi.fn(),
  readOnboardingUpload: vi.fn(),
  assignOnboardingCase: vi.fn(),
  reviewOnboardingRequirement: vi.fn(),
  requestOnboardingCorrection: vi.fn(),
  acceptOnboardingRequirement: vi.fn(),
  uploadOnboardingFile: vi.fn(),
  OnboardingConflictError: class extends Error {},
  OnboardingUnavailableError: class extends Error {},
}));
const continuation = vi.hoisted(() => ({ importPublicContinuation: vi.fn() }));
vi.mock("@/lib/db/server-client", () => ({ getSessionUser: async () => state.user }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => true }));
vi.mock("@/products/onboarding/server", () => onboarding);
vi.mock("@/platform/public-continuations/repository", () => continuation);
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const actor = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "owner@example.com", email_confirmed_at: "2026-09-20T00:00:00.000Z" };
const workspaceId = "11111111-1111-4111-8111-111111111111";
const caseId = "22222222-2222-4222-8222-222222222222";
const requirementId = "33333333-3333-4333-8333-333333333333";
const sameOrigin = { origin: "http://localhost", "sec-fetch-site": "same-origin" };

function streamOf(totalBytes: number, chunk = 64 * 1024) {
  let sent = 0;
  const pulled = { bytes: 0 };
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= totalBytes) { controller.close(); return; }
      const size = Math.min(chunk, totalBytes - sent);
      sent += size;
      pulled.bytes = sent;
      controller.enqueue(new Uint8Array(size).fill(97));
    },
  });
  return { stream, pulled };
}

beforeEach(() => {
  state.user = actor;
  Object.values(onboarding).forEach((mock) => { if ("mockReset" in mock) mock.mockReset(); });
  continuation.importPublicContinuation.mockReset();
});

describe("workspace request body limits", () => {
  it("rejects an oversized onboarding JSON body with 413 before acting", async () => {
    const { POST } = await import("@/app/api/onboarding/route");
    const response = await POST(new Request("http://localhost/api/onboarding", {
      method: "POST",
      headers: { "content-type": "application/json", ...sameOrigin },
      body: JSON.stringify({ action: "create", input: { title: "x".repeat(400_000) } }),
    }));
    expect(response.status).toBe(413);
    expect(onboarding.createOnboardingCase).not.toHaveBeenCalled();
  });

  it("keeps ordinary invalid input at 400, not 413", async () => {
    const { POST } = await import("@/app/api/onboarding/route");
    const response = await POST(new Request("http://localhost/api/onboarding", {
      method: "POST",
      headers: { "content-type": "application/json", ...sameOrigin },
      body: JSON.stringify({ action: "unknown" }),
    }));
    expect(response.status).toBe(400);
  });

  it("stops reading a chunked onboarding body once it passes the limit", async () => {
    const { POST } = await import("@/app/api/onboarding/route");
    const { stream, pulled } = streamOf(20_000_000);
    const response = await POST(new Request("http://localhost/api/onboarding", {
      method: "POST",
      headers: { "content-type": "application/json", ...sameOrigin },
      body: stream,
      duplex: "half",
    } as RequestInit));
    expect(response.status).toBe(413);
    expect(pulled.bytes).toBeLessThan(1_000_000);
  });

  it("rejects an upload whose declared length is over the limit without parsing it", async () => {
    const { POST } = await import("@/app/api/onboarding/upload/route");
    const response = await POST(new Request("http://localhost/api/onboarding/upload", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=x", "content-length": "50000000", ...sameOrigin },
      body: "--x--",
    }));
    expect(response.status).toBe(413);
    expect(onboarding.uploadOnboardingFile).not.toHaveBeenCalled();
  });

  it("stops reading a chunked upload without a declared length once it passes the limit", async () => {
    const { POST } = await import("@/app/api/onboarding/upload/route");
    const { stream, pulled } = streamOf(50_000_000);
    const response = await POST(new Request("http://localhost/api/onboarding/upload", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=x", ...sameOrigin },
      body: stream,
      duplex: "half",
    } as RequestInit));
    expect(response.status).toBe(413);
    expect(pulled.bytes).toBeLessThan(3_000_000);
    expect(onboarding.uploadOnboardingFile).not.toHaveBeenCalled();
  });

  it("still accepts a small multipart upload", async () => {
    onboarding.uploadOnboardingFile.mockResolvedValue({ ok: true });
    const { POST } = await import("@/app/api/onboarding/upload/route");
    const form = new FormData();
    form.set("workspaceId", workspaceId);
    form.set("caseId", caseId);
    form.set("requirementId", requirementId);
    form.set("file", new File(["Name,Status\nA,Open"], "intake.csv", { type: "text/csv" }));
    const response = await POST(new Request("http://localhost/api/onboarding/upload", { method: "POST", headers: sameOrigin, body: form }));
    expect(response.status).toBe(201);
    const call = onboarding.uploadOnboardingFile.mock.calls[0]![1] as { file: File; requirementId: string };
    expect(call.requirementId).toBe(requirementId);
    expect(await call.file.text()).toBe("Name,Status\nA,Open");
  });

  it("rejects an oversized public-continuation import body with 413", async () => {
    const { POST } = await import("@/app/api/public-continuation/import/route");
    const response = await POST(new Request("http://localhost/api/public-continuation/import", {
      method: "POST",
      headers: { "content-type": "application/json", ...sameOrigin },
      body: JSON.stringify({ workspaceId, padding: "x".repeat(100_000) }),
    }));
    expect(response.status).toBe(413);
    expect(continuation.importPublicContinuation).not.toHaveBeenCalled();
  });
});
