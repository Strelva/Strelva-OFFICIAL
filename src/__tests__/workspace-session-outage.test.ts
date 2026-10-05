import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/db/server-client", () => session);
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => true }));

const sameOrigin = { origin: "http://localhost", "sec-fetch-site": "same-origin" };
const workspaceId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  session.getSessionUser.mockReset();
  session.getSessionUser.mockRejectedValue(new Error("supabase auth unreachable: secret-detail"));
});

async function expectUnavailable(response: Response) {
  expect(response.status).toBe(503);
  const body = await response.text();
  expect(body).not.toContain("secret-detail");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
}

describe("workspace routes when the session lookup fails", () => {
  it("operational inbox answers 503", async () => {
    const { GET } = await import("@/app/api/operations/inbox/route");
    await expectUnavailable(await GET(new Request("http://localhost/api/operations/inbox?view=inbox")));
  });

  it("onboarding GET and POST answer 503", async () => {
    const { GET, POST } = await import("@/app/api/onboarding/route");
    await expectUnavailable(await GET(new Request(`http://localhost/api/onboarding?workspaceId=${workspaceId}`)));
    await expectUnavailable(await POST(new Request("http://localhost/api/onboarding", {
      method: "POST", headers: { "content-type": "application/json", ...sameOrigin }, body: JSON.stringify({ action: "create", input: {} }),
    })));
  });

  it("onboarding upload and file download answer 503", async () => {
    const upload = await import("@/app/api/onboarding/upload/route");
    await expectUnavailable(await upload.POST(new Request("http://localhost/api/onboarding/upload", {
      method: "POST", headers: { "content-type": "multipart/form-data; boundary=x", ...sameOrigin }, body: "--x--",
    })));
    const file = await import("@/app/api/onboarding/file/route");
    await expectUnavailable(await file.GET(new Request(`http://localhost/api/onboarding/file?workId=${workspaceId}`)));
  });

  it("workspace exit GET and POST answer 503", async () => {
    const { GET, POST } = await import("@/app/api/workspace-exit/route");
    await expectUnavailable(await GET(new Request(`http://localhost/api/workspace-exit?workspaceId=${workspaceId}`)));
    await expectUnavailable(await POST(new Request("http://localhost/api/workspace-exit", {
      method: "POST", headers: { "content-type": "application/json", ...sameOrigin }, body: JSON.stringify({ workspaceId }),
    })));
  });

  it("public continuation import answers 503", async () => {
    const { POST } = await import("@/app/api/public-continuation/import/route");
    await expectUnavailable(await POST(new Request("http://localhost/api/public-continuation/import", {
      method: "POST", headers: { "content-type": "application/json", ...sameOrigin }, body: JSON.stringify({ workspaceId }),
    })));
  });

  it("still answers 401 when there is simply no session", async () => {
    session.getSessionUser.mockResolvedValue(null);
    const { GET } = await import("@/app/api/workspace-exit/route");
    expect((await GET(new Request(`http://localhost/api/workspace-exit?workspaceId=${workspaceId}`))).status).toBe(401);
  });
});
