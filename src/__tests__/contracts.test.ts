import { describe, expect, it } from "vitest";
import {
  createRevalidationBody,
  GLDF_TENANT_ID,
  scaffoldRoutes,
  signRevalidationBody,
  verifyRevalidationSignature,
} from "@/lib/scaffold-contracts";

describe("Strelva contracts", () => {
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

  // The replay window and signature checks are re-implemented by every deployed
  // client repo. These boundary cases lock the exact semantics so a refactor
  // here can't silently desync verification on a live site.
  describe("revalidation signature boundaries", () => {
    const SECRET = "test-secret";
    const NOW = 1_700_000_000_000;
    const body = createRevalidationBody({ tenant: GLDF_TENANT_ID, all: true });
    const sign = (ts: string) => signRevalidationBody(body, SECRET, ts);

    it("accepts a timestamp exactly at the 5-minute window edge", () => {
      const ts = String(NOW - 300_000); // |now - ts| === 300_000, not > window
      const s = sign(ts);
      expect(
        verifyRevalidationSignature(s.body, SECRET, ts, s.headers["x-reb-signature"], NOW)
      ).toBe(true);
    });

    it("rejects a timestamp just past the window", () => {
      const ts = String(NOW - 300_001);
      const s = sign(ts);
      expect(
        verifyRevalidationSignature(s.body, SECRET, ts, s.headers["x-reb-signature"], NOW)
      ).toBe(false);
    });

    it("rejects a future timestamp past the window (clock skew abuse)", () => {
      const ts = String(NOW + 300_001);
      const s = sign(ts);
      expect(
        verifyRevalidationSignature(s.body, SECRET, ts, s.headers["x-reb-signature"], NOW)
      ).toBe(false);
    });

    it("rejects a tampered body", () => {
      const ts = String(NOW);
      const s = sign(ts);
      const tampered = createRevalidationBody({ tenant: GLDF_TENANT_ID, all: false });
      expect(
        verifyRevalidationSignature(tampered, SECRET, ts, s.headers["x-reb-signature"], NOW)
      ).toBe(false);
    });

    it("rejects a wrong secret", () => {
      const ts = String(NOW);
      const s = sign(ts);
      expect(
        verifyRevalidationSignature(s.body, "other-secret", ts, s.headers["x-reb-signature"], NOW)
      ).toBe(false);
    });

    it("rejects a tampered / wrong-length signature without throwing", () => {
      const ts = String(NOW);
      expect(verifyRevalidationSignature(body, SECRET, ts, "deadbeef", NOW)).toBe(false);
      expect(verifyRevalidationSignature(body, SECRET, ts, "", NOW)).toBe(false);
      expect(verifyRevalidationSignature(body, SECRET, ts, "zz", NOW)).toBe(false);
    });

    it("rejects a non-numeric timestamp", () => {
      const ts = String(NOW);
      const s = sign(ts);
      expect(
        verifyRevalidationSignature(s.body, SECRET, "not-a-number", s.headers["x-reb-signature"], NOW)
      ).toBe(false);
    });
  });

  // Lock the wire format itself: client repos hard-code these header names and
  // the `${timestamp}.${body}` signing preimage. Renaming a header or changing
  // the preimage is a breaking change that must go through a v2 contract.
  describe("signed-request wire shape", () => {
    it("emits exactly the frozen header names", () => {
      const body = createRevalidationBody({ tenant: GLDF_TENANT_ID });
      const signed = signRevalidationBody(body, "s", "1700000000000");
      expect(Object.keys(signed.headers).sort()).toEqual([
        "Content-Type",
        "x-reb-signature",
        "x-reb-timestamp",
      ]);
      expect(signed.headers["Content-Type"]).toBe("application/json");
      expect(signed.body).toBe(body);
    });

    it("keeps the v1 route paths stable", () => {
      expect(scaffoldRoutes.publicContent("acme", "hero")).toBe("/api/v1/content/acme/hero");
      expect(scaffoldRoutes.publicPageConfig("acme")).toBe("/api/v1/page-config/acme");
      expect(scaffoldRoutes.revalidate()).toBe("/api/v1/revalidate");
    });
  });
});
