import { describe, expect, it } from "vitest";
import { BUSINESS_START_PRODUCTS, businessStartHref, businessStartRequest, businessStartView, isBusinessStartProduct } from "@/lib/business-start";
import { workspaceReturnTarget, accountReturnTarget } from "@/lib/workspace-location";

describe("public business starts", () => {
  it.each(BUSINESS_START_PRODUCTS)("preserves %s through the bounded sign-in return", product => {
    const href = businessStartHref(product);
    expect(isBusinessStartProduct(product)).toBe(true);
    expect(workspaceReturnTarget(href)).toBe(href);
    expect(accountReturnTarget(`/account?next=${encodeURIComponent(href)}`)).toBe(`/account?next=${encodeURIComponent(href)}`);
  });

  it("makes website delivery a reviewable service request, not a generation assignment", () => {
    expect(businessStartRequest("website")).toBe("Have Strelva build a website for my business.");
    expect(businessStartView("website")).toBe("help");
    expect(businessStartRequest("website")).not.toContain("24");
  });

  it.each(["applications", "onboarding", "tracker", "document"] as const)("does not create an agency request for %s", product => {
    expect(businessStartRequest(product)).toBe("");
    expect(businessStartView(product)).toBe(product);
  });

  for (const value of [null, undefined, {}, ["website"], "", "https://example.test", "//example.test", "website&tenantId=other", "websites"]) {
    it(`rejects unknown start ${JSON.stringify(value)}`, () => {
      expect(isBusinessStartProduct(value)).toBe(false);
    });
  }

  it.each(["/workspace/business/new?start=website&request=private", "/workspace/business/new?start=website&start=applications", "/workspace/business/new?start=website#secret"])("does not carry arbitrary request data in %s", value => {
    expect(workspaceReturnTarget(value)).toBeNull();
  });
});
