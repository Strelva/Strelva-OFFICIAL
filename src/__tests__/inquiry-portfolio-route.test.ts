import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), enabled: vi.fn(), discover: vi.fn() }));
vi.mock("@/lib/auth", () => ({ verifyAuth: mocks.auth }));
vi.mock("@/products/inquiries/release", () => ({ inquiryReleaseEnabled: mocks.enabled }));
vi.mock("@/products/inquiries/portfolio", () => ({ discoverInquiryPortfolio: mocks.discover }));
import { GET } from "@/app/api/inquiry-workspace/portfolio/route";

describe("private inquiry portfolio route", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue(true); mocks.enabled.mockReturnValue(true); mocks.discover.mockResolvedValue({ attention: [], patterns: [], unavailableTenantIds: [] }); });
  it("checks release and login before discovering businesses", async () => {
    mocks.enabled.mockReturnValue(false);
    expect((await GET()).status).toBe(503);
    mocks.enabled.mockReturnValue(true); mocks.auth.mockResolvedValue(false);
    expect((await GET()).status).toBe(401);
    expect(mocks.discover).not.toHaveBeenCalled();
  });
  it("does not cache private decisions", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("does not expose provider failures as empty successful work", async () => {
    mocks.discover.mockRejectedValue(new Error("private connection details"));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private connection details");
  });
});
