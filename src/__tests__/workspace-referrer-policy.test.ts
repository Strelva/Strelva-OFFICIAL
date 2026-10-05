import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/server-client", () => ({ getSessionUser: async () => null }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => true }));

function expectPrivateHeaders(response: Response) {
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
}

describe("workspace JSON responses carry Referrer-Policy", () => {
  it("documents, tracker, and product learning", async () => {
    const documents = await import("@/app/api/documents/route");
    expectPrivateHeaders(await documents.GET(new Request("http://localhost/api/documents?workId=x")));
    const tracker = await import("@/app/api/tracker/route");
    expectPrivateHeaders(await tracker.GET(new Request("http://localhost/api/tracker?workId=x")));
    const learning = await import("@/app/api/product-learning/route");
    expectPrivateHeaders(await learning.GET(new Request("http://localhost/api/product-learning?workId=x")));
  });

  it("onboarding case, upload, and file routes", async () => {
    const onboarding = await import("@/app/api/onboarding/route");
    expectPrivateHeaders(await onboarding.GET(new Request("http://localhost/api/onboarding")));
    const upload = await import("@/app/api/onboarding/upload/route");
    expectPrivateHeaders(await upload.POST(new Request("http://localhost/api/onboarding/upload", { method: "POST", headers: { origin: "https://evil.example" } })));
    const file = await import("@/app/api/onboarding/file/route");
    expectPrivateHeaders(await file.GET(new Request("http://localhost/api/onboarding/file?workId=x")));
  });

  it("public continuation import and the shared agent-access helper", async () => {
    const continuation = await import("@/app/api/public-continuation/import/route");
    expectPrivateHeaders(await continuation.POST(new Request("http://localhost/api/public-continuation/import", { method: "POST", headers: { origin: "https://evil.example" } })));
    const { privateJson } = await import("@/platform/agent-access/http");
    expectPrivateHeaders(privateJson({ ok: true }));
  });
});
