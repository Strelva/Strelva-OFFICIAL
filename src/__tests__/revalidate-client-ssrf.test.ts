import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// getTenantConfig steers the tenant; isSafeFetchUrl is stubbed so this asserts
// the INTEGRATION (the guard is wired + honored) independent of prod/env
// detection — isSafeFetchUrl's own logic is covered in safe-fetch.test.ts.
vi.mock("@/lib/tenants", () => ({
  getTenantConfig: vi.fn(),
  getActiveTenants: vi.fn(async () => []),
}));
vi.mock("@/lib/safe-fetch", () => ({
  isSafeFetchUrl: vi.fn(),
}));

import { revalidateClientSite } from "@/lib/revalidate-client";
import { getTenantConfig } from "@/lib/tenants";
import { isSafeFetchUrl } from "@/lib/safe-fetch";

const mockConfig = (overrides: Record<string, unknown>) =>
  ({ id: "acme", deliveryModel: "custom_repo", ...overrides }) as never;

describe("revalidateClientSite SSRF guard (audit #34)", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("refuses when isSafeFetchUrl rejects the target, WITHOUT fetching", async () => {
    vi.mocked(getTenantConfig).mockResolvedValue(
      mockConfig({ revalidateUrl: "http://169.254.169.254/latest", revalidationSecret: "s3cret" }),
    );
    vi.mocked(isSafeFetchUrl).mockReturnValue(false);

    const result = await revalidateClientSite("acme", "all");

    expect(isSafeFetchUrl).toHaveBeenCalledWith("http://169.254.169.254/latest");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not a safe external URL/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does NOT follow redirects when posting the signed revalidation (redirect: manual)", async () => {
    vi.mocked(getTenantConfig).mockResolvedValue(
      mockConfig({ revalidateUrl: "https://client.example.com/api/revalidate", revalidationSecret: "s3cret" }),
    );
    vi.mocked(isSafeFetchUrl).mockReturnValue(true);
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await revalidateClientSite("acme", ["/"]);

    expect(fetchSpy).toHaveBeenCalled();
    const opts = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(opts?.redirect).toBe("manual");
    expect(opts?.method).toBe("POST");
  });
});
