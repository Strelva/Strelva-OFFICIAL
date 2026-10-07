import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock("@/platform/agency-prospecting/server", () => ({ resolveAgencyAttribution: mocks.resolve }));
import proxy from "@/proxy";
const request = (path: string) => new NextRequest(`https://app.strelva.com${path}`, { headers: { host: "app.strelva.com" } });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("SCAFFOLD_DEV_UNGATED_ACCESS", "1");
  mocks.resolve.mockResolvedValue({ slug: "northside", contactUrl: "https://north.example/contact?next=evil.example" });
});
afterEach(() => vi.unstubAllEnvs());

describe("agency embed frame authority", () => {
  it.each(["ai-visibility", "audit"])("allows only the server-resolved HTTPS agency origin for %s", async tool => {
    const response = await proxy(request(`/embed/agency/northside/${tool}?agency=southside&origin=https://evil.example`));
    expect(response.status).toBe(200);
    expect(mocks.resolve).toHaveBeenCalledWith("northside");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'self' https://north.example");
    expect(response.headers.get("content-security-policy")).not.toContain("evil.example");
    expect(response.headers.has("x-frame-options")).toBe(false);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("denies disabled or missing profiles", async () => {
    mocks.resolve.mockResolvedValue(undefined);
    const response = await proxy(request("/embed/agency/unknown/audit"));
    expect(response.status).toBe(404); expect(response.headers.get("x-frame-options")).toBe("DENY");
  });
  it("fails closed when profile lookup is unavailable", async () => {
    mocks.resolve.mockRejectedValue(new Error("Database unavailable"));
    const response = await proxy(request("/embed/agency/northside/audit"));
    expect(response.status).toBe(404); expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });
  it.each(["/ai-visibility?agency=northside", "/audit?agency=northside", "/workspace/prospects", "/embed/agency/northside/settings"])("retains DENY for %s", async path => {
    const response = await proxy(request(path));
    expect(response.headers.get("x-frame-options")).toBe("DENY"); expect(mocks.resolve).not.toHaveBeenCalled();
  });
});
