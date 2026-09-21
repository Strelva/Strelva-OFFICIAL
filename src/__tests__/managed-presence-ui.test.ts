import { describe, expect, it } from "vitest";
import { MANAGED_WEBSITES_COPY, MANAGED_WEBSITES_LABEL } from "@/products/managed-presence";

describe("managed websites product presentation", () => {
  it("uses customer-facing managed website terminology", () => {
    expect(MANAGED_WEBSITES_LABEL).toBe("Managed Websites");
    expect(MANAGED_WEBSITES_COPY.navigationLabel).toBe("Managed Websites navigation");
    expect(MANAGED_WEBSITES_COPY.discussionLabel).toBe("Ask Strelva");
  });
});
