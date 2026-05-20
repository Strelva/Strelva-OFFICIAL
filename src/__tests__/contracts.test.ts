import { describe, expect, it } from "vitest";
import {
  createRevalidationBody,
  GLDF_TENANT_ID,
  scaffoldRoutes,
  signRevalidationBody,
  verifyRevalidationSignature,
} from "@/lib/scaffold-contracts";

describe("Scaffold Web contracts", () => {
  it("builds versioned storefront routes", () => {
    expect(scaffoldRoutes.publicContent(GLDF_TENANT_ID, "hero")).toBe("/api/v1/content/gldf/hero");
    expect(scaffoldRoutes.publicPageConfig(GLDF_TENANT_ID)).toBe("/api/v1/page-config/gldf");
    expect(scaffoldRoutes.revalidate()).toBe("/api/v1/revalidate");
  });

  it("round-trips signed revalidation payloads", () => {
    const body = createRevalidationBody({ tenant: GLDF_TENANT_ID, paths: ["/"] });
    const signed = signRevalidationBody(body, "test-secret", "1700000000000");

    expect(
      verifyRevalidationSignature(
        signed.body,
        "test-secret",
        signed.headers["x-reb-timestamp"],
        signed.headers["x-reb-signature"],
        1700000000000
      )
    ).toBe(true);
  });
});
