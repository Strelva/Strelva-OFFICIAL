/**
 * Executable custom-repo conformance.
 *
 * The truth source for "a custom repo can interoperate with the Strelva control
 * plane" is EXECUTION, not string presence. This module runs the real contract:
 *
 *   1. HMAC revalidation: sign a payload with the platform signer, verify it
 *      with the platform verifier (round-trip), and prove tampering FAILS.
 *   2. Capability manifest: build a manifest the way a real custom repo does
 *      (via the drop-in `custom-repo-starter` builder) and run it through the
 *      exact Zod schema the control plane validates a published manifest with.
 *   3. Wire-version agreement between the platform contract and the starter
 *      client that ships into every custom repo.
 *
 * It needs NO sibling client repo checked out — it exercises the platform + the
 * `custom-repo-starter` scaffold that every custom repo drops in. Both the
 * `scripts/custom-repo-workspace-check.ts` CLI and the vitest fixture
 * (`src/__tests__/custom-repo-conformance.test.ts`) call it, so the check and
 * the test can never assert different things.
 *
 * Imports are relative (no `@/` alias) so this runs identically under `tsx`
 * (the check CLI) and vitest. None of the imported modules pull in `next/*`.
 */
import {
  SCAFFOLD_CONTRACT_VERSION,
  createRevalidationBody,
  parseRevalidationPayload,
  signRevalidationBody,
  verifyRevalidationSignature,
} from "../src/lib/scaffold-contracts";
import { siteCapabilityManifestSchema } from "../src/lib/schemas";
import {
  SCAFFOLD_CONTRACT_VERSION as STARTER_CONTRACT_VERSION,
  buildSiteCapabilityManifest,
} from "../custom-repo-starter/scaffold-client";
import { defaults } from "../custom-repo-starter/content-defaults";

export type ConformanceResult = {
  name: string;
  ok: boolean;
  detail?: string;
};

// The sections a real custom repo publishes: every content section the starter
// scaffold ships defaults for. `site-capabilities-route.ts` builds the manifest
// from exactly `Object.keys(defaults)`, so this is the live editable-section set.
export const EXPECTED_MANIFEST_SECTIONS = Object.keys(defaults).sort();

// Commerce + rewards are declared custom-only in the real starter route; mirror
// it so the fixture builds the same manifest a deployed repo would publish.
const CUSTOM_ONLY_FEATURES = ["cart", "checkout", "rewards"];

const TEST_SECRET = "conformance-shared-secret";

function check(name: string, ok: boolean, detail?: string): ConformanceResult {
  return { name, ok, detail: ok ? undefined : detail };
}

/**
 * HMAC revalidation round-trip: the platform signer's output must verify with
 * the platform verifier, and every tamper (body, signature, stale timestamp)
 * must be rejected. This is the signing half of the wire contract a custom
 * repo's revalidation endpoint depends on.
 */
export function runRevalidationConformance(): ConformanceResult[] {
  const results: ConformanceResult[] = [];

  const body = createRevalidationBody({ tenant: "gldf", paths: ["/", "/shop"], tags: ["content"] });
  const timestamp = "1700000000000";
  const now = Number(timestamp) + 1_000; // within the 5-minute window
  const signed = signRevalidationBody(body, TEST_SECRET, timestamp);
  const signature = signed.headers["x-reb-signature"];

  results.push(
    check(
      "revalidation:sign-verify-roundtrip",
      verifyRevalidationSignature(body, TEST_SECRET, timestamp, signature, now),
      "platform verifier rejected a platform-signed payload"
    )
  );

  results.push(
    check(
      "revalidation:tampered-body-rejected",
      !verifyRevalidationSignature(`${body} `, TEST_SECRET, timestamp, signature, now),
      "verifier accepted a mutated body"
    )
  );

  const flipped = signature.slice(0, -1) + (signature.endsWith("0") ? "1" : "0");
  results.push(
    check(
      "revalidation:tampered-signature-rejected",
      !verifyRevalidationSignature(body, TEST_SECRET, timestamp, flipped, now),
      "verifier accepted a mutated signature"
    )
  );

  results.push(
    check(
      "revalidation:wrong-secret-rejected",
      !verifyRevalidationSignature(body, "not-the-secret", timestamp, signature, now),
      "verifier accepted a signature made with a different secret"
    )
  );

  results.push(
    check(
      "revalidation:stale-timestamp-rejected",
      !verifyRevalidationSignature(body, TEST_SECRET, timestamp, signature, Number(timestamp) + 600_000),
      "verifier accepted a signature outside the replay window"
    )
  );

  const parsed = parseRevalidationPayload(JSON.parse(body));
  results.push(
    check(
      "revalidation:payload-parse-roundtrip",
      parsed !== null && parsed.tenant === "gldf" && parsed.paths?.[0] === "/",
      "parseRevalidationPayload did not round-trip a signed body"
    )
  );

  results.push(
    check(
      "revalidation:payload-parse-rejects-junk",
      parseRevalidationPayload({ tenant: 42, paths: "nope" }) === null,
      "parseRevalidationPayload accepted a malformed payload"
    )
  );

  return results;
}

/**
 * Capability-manifest round-trip: build the manifest via the starter builder a
 * real custom repo uses, then validate it with the control plane's own Zod
 * schema (the exact `safeParse` in `getSiteCapabilityManifest`). Proves the
 * starter emits a manifest the control plane accepts, by executing both sides.
 */
export function runManifestConformance(): ConformanceResult[] {
  const results: ConformanceResult[] = [];

  const manifest = buildSiteCapabilityManifest(Object.keys(defaults), {
    customOnlyFeatures: CUSTOM_ONLY_FEATURES,
  });

  const parsed = siteCapabilityManifestSchema.safeParse(manifest);
  results.push(
    check(
      "manifest:control-plane-accepts",
      parsed.success,
      parsed.success ? undefined : `schema rejected the starter manifest: ${parsed.error?.message}`
    )
  );

  if (parsed.success) {
    const sections = Object.keys(parsed.data.sections).sort();
    const sectionsMatch =
      sections.length === EXPECTED_MANIFEST_SECTIONS.length &&
      sections.every((s, i) => s === EXPECTED_MANIFEST_SECTIONS[i]);
    results.push(
      check(
        "manifest:editable-section-set",
        sectionsMatch,
        `expected sections ${EXPECTED_MANIFEST_SECTIONS.join(",")} got ${sections.join(",")}`
      )
    );

    results.push(
      check(
        "manifest:custom-only-features-preserved",
        CUSTOM_ONLY_FEATURES.every((f) => parsed.data.customOnlyFeatures.includes(f)),
        "control plane dropped the repo's customOnlyFeatures"
      )
    );

    results.push(
      check(
        "manifest:contract-version-agrees",
        parsed.data.contractVersion === SCAFFOLD_CONTRACT_VERSION &&
          STARTER_CONTRACT_VERSION === SCAFFOLD_CONTRACT_VERSION,
        `version mismatch: platform=${SCAFFOLD_CONTRACT_VERSION} starter=${STARTER_CONTRACT_VERSION} manifest=${parsed.data.contractVersion}`
      )
    );
  }

  return results;
}

/**
 * The full platform + starter contract conformance. Runs with no sibling client
 * repo present — it proves the wire contract the control plane and the drop-in
 * scaffold agree on, which every custom repo inherits by dropping the scaffold in.
 */
export function runPlatformContractConformance(): ConformanceResult[] {
  return [...runRevalidationConformance(), ...runManifestConformance()];
}
