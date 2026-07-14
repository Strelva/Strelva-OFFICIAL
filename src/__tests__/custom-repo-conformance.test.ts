import { describe, expect, it } from "vitest";

import {
  EXPECTED_MANIFEST_SECTIONS,
  runManifestConformance,
  runPlatformContractConformance,
  runRevalidationConformance,
} from "../../scripts/custom-repo-conformance";
import { signRevalidationBody } from "@/lib/scaffold-contracts";
import { siteCapabilityManifestSchema } from "@/lib/schemas";
import { buildSiteCapabilityManifest } from "../../custom-repo-starter/scaffold-client";
import { defaults } from "../../custom-repo-starter/content-defaults";
// The RECEIVING half of the wire contract: the client repo's revalidation
// endpoint verifier. Importing it proves interop by execution, not by grepping
// for `signRevalidationBody` in the repo's source.
import { verifySignature as clientVerifySignature } from "../../custom-repo-starter/revalidate-route";

/**
 * Executable custom-repo conformance.
 *
 * This replaces the string-grep marker checks (`source.includes("signRevalidationBody")`)
 * that used to "prove" a custom repo was compatible. Presence of a symbol name
 * proves nothing about whether the contract WORKS. These tests exercise the real
 * contract end to end against the platform + the `custom-repo-starter` scaffold
 * every custom repo drops in — no sibling client repo needs to be checked out.
 */

describe("custom-repo conformance (shared truth source)", () => {
  it("passes the full platform + starter contract conformance", () => {
    const failures = runPlatformContractConformance().filter((r) => !r.ok);
    expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
  });

  it("revalidation conformance covers the round-trip and every tamper", () => {
    const names = runRevalidationConformance().map((r) => r.name);
    expect(names).toContain("revalidation:sign-verify-roundtrip");
    expect(names).toContain("revalidation:tampered-body-rejected");
    expect(names).toContain("revalidation:tampered-signature-rejected");
    expect(names).toContain("revalidation:stale-timestamp-rejected");
  });

  it("manifest conformance covers acceptance and the editable-section set", () => {
    const names = runManifestConformance().map((r) => r.name);
    expect(names).toContain("manifest:control-plane-accepts");
    expect(names).toContain("manifest:editable-section-set");
  });
});

describe("HMAC revalidation interop: platform signs, client verifies", () => {
  const secret = "interop-secret";
  const body = JSON.stringify({ tenant: "gldf", paths: ["/"], tags: ["content"] });

  it("a platform-signed body verifies in the client repo's revalidation endpoint", () => {
    const ts = Date.now().toString();
    const { headers } = signRevalidationBody(body, secret, ts);
    // The client verifier uses Date.now() internally, so a fresh timestamp is
    // inside its 5-minute window.
    expect(clientVerifySignature(body, secret, ts, headers["x-reb-signature"])).toBe(true);
  });

  it("the client verifier rejects a tampered body", () => {
    const ts = Date.now().toString();
    const { headers } = signRevalidationBody(body, secret, ts);
    expect(clientVerifySignature(`${body} `, secret, ts, headers["x-reb-signature"])).toBe(false);
  });

  it("the client verifier rejects a signature made with the wrong secret", () => {
    const ts = Date.now().toString();
    const { headers } = signRevalidationBody(body, "other-secret", ts);
    expect(clientVerifySignature(body, secret, ts, headers["x-reb-signature"])).toBe(false);
  });

  it("the client verifier rejects a stale timestamp", () => {
    const staleTs = (Date.now() - 600_000).toString();
    const { headers } = signRevalidationBody(body, secret, staleTs);
    expect(clientVerifySignature(body, secret, staleTs, headers["x-reb-signature"])).toBe(false);
  });
});

describe("capability manifest interop: starter builds, control plane accepts", () => {
  it("the starter builder emits a manifest the platform schema accepts", () => {
    const manifest = buildSiteCapabilityManifest(Object.keys(defaults), {
      customOnlyFeatures: ["cart", "checkout", "rewards"],
    });
    const parsed = siteCapabilityManifestSchema.safeParse(manifest);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(Object.keys(parsed.data.sections).sort()).toEqual(EXPECTED_MANIFEST_SECTIONS);
      expect(parsed.data.customOnlyFeatures).toEqual(
        expect.arrayContaining(["cart", "checkout", "rewards"])
      );
    }
  });

  it("rejects a manifest with an invalid design token (control plane guards the shape)", () => {
    const manifest = buildSiteCapabilityManifest(["hero"]);
    const bad = { ...manifest, designTokens: ["colors", "not-a-real-token"] };
    expect(siteCapabilityManifestSchema.safeParse(bad).success).toBe(false);
  });
});
