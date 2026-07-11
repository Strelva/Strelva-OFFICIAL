import { beforeEach, describe, expect, it, vi } from "vitest";

const mockIsSuperAdmin = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ isSuperAdmin: mockIsSuperAdmin }));

import { GET } from "@/app/api/admin/inspect/route";

function req(url: string) {
  // The route only reads request.url — a plain Request is enough. NextResponse
  // .redirect + .cookies work against a standard Request in the node test env.
  return new Request(url) as unknown as Parameters<typeof GET>[0];
}

describe("GET /api/admin/inspect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSuperAdmin.mockResolvedValue(true);
  });

  it("403s a non-super-admin and never sets the cookie", async () => {
    mockIsSuperAdmin.mockResolvedValue(false);
    const res = await GET(req("https://admin.strelva.com/api/admin/inspect?on=1&to=/dashboard"));
    expect(res.status).toBe(403);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("sets the inspect cookie on ?on=1 and redirects to a safe relative path", async () => {
    const res = await GET(
      req("https://admin.strelva.com/api/admin/inspect?on=1&to=/client/gldf/dashboard"),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://admin.strelva.com/client/gldf/dashboard");
    const cookie = res.headers.get("set-cookie") || "";
    expect(cookie).toContain("strelva_inspect=1");
    expect(cookie.toLowerCase()).toContain("httponly");
  });

  it("clears the cookie on ?on=0", async () => {
    const res = await GET(req("https://admin.strelva.com/api/admin/inspect?on=0&to=/admin/clients/gldf"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://admin.strelva.com/admin/clients/gldf");
    const cookie = res.headers.get("set-cookie") || "";
    // Cleared: empty value + immediate expiry (Max-Age=0).
    expect(cookie).toContain("strelva_inspect=");
    expect(cookie).toMatch(/max-age=0/i);
  });

  it("rejects an absolute-URL open redirect, falling back to /admin", async () => {
    const res = await GET(req("https://admin.strelva.com/api/admin/inspect?on=1&to=https://evil.com"));
    expect(res.headers.get("location")).toBe("https://admin.strelva.com/admin");
  });

  it("rejects a protocol-relative open redirect, falling back to /admin", async () => {
    const res = await GET(req("https://admin.strelva.com/api/admin/inspect?on=1&to=//evil.com"));
    expect(res.headers.get("location")).toBe("https://admin.strelva.com/admin");
  });

  it("falls back to /admin when no `to` is supplied", async () => {
    const res = await GET(req("https://admin.strelva.com/api/admin/inspect?on=1"));
    expect(res.headers.get("location")).toBe("https://admin.strelva.com/admin");
  });
});
