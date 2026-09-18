import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  workspaceReleaseEnabled: vi.fn(() => true),
  getSessionUser: vi.fn(),
  cookieValue: "",
  importPublicContinuation: vi.fn(),
}));

vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: mocks.workspaceReleaseEnabled }));
vi.mock("@/lib/db/server-client", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => mocks.cookieValue ? { value: mocks.cookieValue } : undefined }) }));
vi.mock("@/platform/public-continuations/repository", () => ({ importPublicContinuation: mocks.importPublicContinuation }));

const brief = {
  version: 1 as const,
  id: "11111111-1111-4111-8111-111111111111",
  businessName: "Harbor Dental",
  request: "Help every inquiry receive a follow-up.",
  result: "Every new inquiry has a visible next step.",
  resultTitle: "Give every inquiry a next step.",
  scope: "One inquiry source and one follow-up.",
  review: true,
  fileNames: ["current-process.txt"],
};

describe("public-to-account continuation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("PUBLIC_CONTINUATION_SECRET", "unit-test-continuation-secret");
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    mocks.workspaceReleaseEnabled.mockReturnValue(true);
    mocks.getSessionUser.mockResolvedValue({ id: "user-1", email: "owner@example.com", email_confirmed_at: "2026-09-18T00:00:00Z" });
  });

  it("encrypts the bounded brief and rejects tampering", async () => {
    const { openPublicContinuation, sealPublicContinuation } = await import("@/lib/public-continuation");
    const sealed = sealPublicContinuation(brief);
    expect(sealed).toBeTruthy();
    expect(sealed).not.toContain("Harbor");
    expect(openPublicContinuation(sealed || undefined)).toEqual(brief);
    expect(openPublicContinuation(`${sealed}x`)).toBeNull();
  });

  it("accepts only the configured public origin and keeps private text out of the destination", async () => {
    vi.stubEnv("PUBLIC_SITE_ORIGIN", "https://strelva.com");
    const { POST } = await import("@/app/api/public-continuation/route");
    const response = await POST(new Request("https://app.strelva.com/api/public-continuation", {
      method: "POST",
      headers: { origin: "https://strelva.com", "content-type": "application/json" },
      body: JSON.stringify(brief),
    }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.location).toBe("/sign-in?next=%2Fworkspace%2Faccount%3Fcontinue%3Dpublic");
    expect(JSON.stringify(body)).not.toContain(brief.request);
    expect(response.headers.get("set-cookie")).not.toContain("Harbor");

    const denied = await POST(new Request("https://app.strelva.com/api/public-continuation", {
      method: "POST",
      headers: { origin: "https://evil.example", "content-type": "application/json" },
      body: JSON.stringify(brief),
    }));
    expect(denied.status).toBe(403);
  });

  it("rejects an oversized body before buffering the full request", async () => {
    const { POST } = await import("@/app/api/public-continuation/route");
    const response = await POST(new Request("https://app.strelva.com/api/public-continuation", {
      method: "POST",
      headers: { origin: "https://strelva.com", "content-type": "application/json", "content-length": "9000" },
      body: "{}",
    }));
    expect(response.status).toBe(413);
  });

  it("imports once into the selected authorized workspace and returns the exact document", async () => {
    const { sealPublicContinuation } = await import("@/lib/public-continuation");
    mocks.cookieValue = sealPublicContinuation(brief) || "";
    mocks.importPublicContinuation.mockResolvedValue({
      workspaceId: "22222222-2222-4222-8222-222222222222",
      workId: "33333333-3333-4333-8333-333333333333",
      alreadyImported: false,
    });
    const { POST } = await import("@/app/api/public-continuation/import/route");
    const response = await POST(new Request("https://app.strelva.com/api/public-continuation/import", {
      method: "POST",
      headers: { origin: "https://app.strelva.com", "content-type": "application/json", "sec-fetch-site": "same-origin" },
      body: JSON.stringify({ workspaceId: "22222222-2222-4222-8222-222222222222" }),
    }));
    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.json()).toMatchObject({
      location: "/workspace?workspaceId=22222222-2222-4222-8222-222222222222&work=33333333-3333-4333-8333-333333333333&view=document",
    });
    expect(mocks.importPublicContinuation).toHaveBeenCalledWith(
      { userId: "user-1", verifiedEmail: "owner@example.com" },
      "22222222-2222-4222-8222-222222222222",
      expect.objectContaining({
        continuationId: brief.id,
        title: brief.resultTitle,
        input: { source: "public_session", businessName: brief.businessName },
      }),
    );
  });

  it("accepts no-Origin browser fetches only with same-origin fetch metadata", async () => {
    const { sealPublicContinuation } = await import("@/lib/public-continuation");
    mocks.cookieValue = sealPublicContinuation(brief) || "";
    mocks.importPublicContinuation.mockResolvedValue({
      workspaceId: "22222222-2222-4222-8222-222222222222",
      workId: "33333333-3333-4333-8333-333333333333",
      alreadyImported: false,
    });
    const { POST } = await import("@/app/api/public-continuation/import/route");
    const makeRequest = (headers: Record<string, string>) => POST(new Request("https://internal-host/api/public-continuation/import", {
      method: "POST",
      headers: { "content-type": "application/json", host: "app.strelva.com", "x-forwarded-proto": "https", ...headers },
      body: JSON.stringify({ workspaceId: "22222222-2222-4222-8222-222222222222" }),
    }));

    expect((await makeRequest({ "sec-fetch-site": "same-origin" })).status).toBe(201);
    expect((await makeRequest({})).status).toBe(403);
    expect((await makeRequest({ origin: "null", "sec-fetch-site": "same-origin" })).status).toBe(403);
    expect((await makeRequest({ origin: "https://evil.example", "sec-fetch-site": "same-origin" })).status).toBe(403);
    expect((await makeRequest({ origin: "https://app.strelva.com", "sec-fetch-site": "cross-site" })).status).toBe(403);
  });

  it("does not expose the brief when the cookie is missing and bounds unauthorized destinations", async () => {
    mocks.cookieValue = "";
    const { POST } = await import("@/app/api/public-continuation/import/route");
    const missing = await POST(new Request("https://app.strelva.com/api/public-continuation/import", {
      method: "POST",
      headers: { origin: "https://app.strelva.com", "content-type": "application/json" },
      body: JSON.stringify({ workspaceId: "22222222-2222-4222-8222-222222222222" }),
    }));
    expect(missing.status).toBe(410);
    expect(await missing.text()).not.toContain(brief.request);

    const { WorkspaceAccessError } = await import("@/platform/workspaces");
    const { sealPublicContinuation } = await import("@/lib/public-continuation");
    mocks.cookieValue = sealPublicContinuation(brief) || "";
    mocks.importPublicContinuation.mockRejectedValue(new WorkspaceAccessError());
    const denied = await POST(new Request("https://app.strelva.com/api/public-continuation/import", {
      method: "POST",
      headers: { origin: "https://app.strelva.com", "content-type": "application/json" },
      body: JSON.stringify({ workspaceId: "44444444-4444-4444-8444-444444444444" }),
    }));
    expect(denied.status).toBe(403);
    expect(await denied.text()).not.toContain(brief.request);
  });
});
