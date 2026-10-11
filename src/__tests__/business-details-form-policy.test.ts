import { expect, it, vi } from "vitest";
vi.mock("@/experience/places/WorkspaceBusinessDetails", () => ({ WorkspaceBusinessDetails: () => null }));
vi.mock("@/app/workspace/business-details/actions", () => ({ saveBusinessDetailsAction: vi.fn() }));
it("keeps workspace URLs private across origins without suppressing same-origin form provenance", async () => {
  const { metadata } = await import("@/app/workspace/business-details/page");
  expect(metadata.referrer).toBe("same-origin");
  expect(metadata.robots).toEqual({ index: false, follow: false });
});
