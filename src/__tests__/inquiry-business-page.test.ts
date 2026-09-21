import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  release: vi.fn(),
  access: vi.fn(),
  config: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
  redirect: (href: string) => { throw new Error(`REDIRECT:${href}`); },
}));
vi.mock("@/lib/auth", () => ({ requireTenantAccess: mocks.access }));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: mocks.config }));
vi.mock("@/products/inquiries/server", () => ({ inquiryReleaseEnabled: mocks.release }));
vi.mock("@/experience/inquiries/InquiryServerExperience", () => ({ InquiryServerExperience: () => null }));

import BusinessPage from "@/app/business/[tenant]/page";

const page = (tenant = "example") => BusinessPage({ params: Promise.resolve({ tenant }) });

describe("private inquiry business entry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.release.mockReturnValue(true);
    mocks.access.mockResolvedValue(null);
    mocks.config.mockResolvedValue({ id: "example", active: true, ownerEmail: "private@example.invalid" });
  });

  it("keeps the route closed until release is explicitly enabled", async () => {
    mocks.release.mockReturnValue(false);
    await expect(page()).rejects.toThrow("NOT_FOUND");
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.config).not.toHaveBeenCalled();
  });

  it("preserves the selected business through sign in without reading its data", async () => {
    mocks.access.mockResolvedValue({ status: 401 });
    await expect(page()).rejects.toThrow("REDIRECT:/sign-in?next=%2Fbusiness%2Fexample");
    expect(mocks.config).not.toHaveBeenCalled();
  });

  it("does not reveal a foreign business or read its configuration", async () => {
    mocks.access.mockResolvedValue({ status: 403 });
    await expect(page()).rejects.toThrow("NOT_FOUND");
    expect(mocks.config).not.toHaveBeenCalled();
  });

  it("rejects inactive businesses", async () => {
    mocks.config.mockResolvedValue({ active: false });
    await expect(page()).rejects.toThrow("NOT_FOUND");
  });

  it("passes only the authorized routing identity to the client", async () => {
    const element = await page();
    expect(mocks.access).toHaveBeenCalledWith("example");
    expect(element.props).toEqual({ tenantId: "example" });
  });
});
