import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { browserContextEnvironment, localBrowserSafetyEnvironment, recordedProductionRelease, contexts, browserServerCommand, installProofRoutes, proofRoutes, validateContextResult, validateDiscovery, validateNativeOwnership } from "../browser-ci-contexts.mjs";

const manifest = { version: 1, entries: [{ file: "actual.spec.ts", context: "preview", cases: [{ title: "Actual case", project: "desktop", originalStatus: "passed" }] }] };
const report = status => ({ suites: [{ specs: [{ file: "actual.spec.ts", title: "Actual case", tests: [{ projectName: "desktop", expectedStatus: "passed", results: [{ status }] }] }] }] });

test("public proof retains the requested built app while fictional contexts require dev", () => {
  assert.match(browserServerCommand("public", 3119, "1"), /next start --hostname 127\.0\.0\.1 --port 3119$/);
  assert.match(browserServerCommand("public", 3119, "0"), /next dev/);
  for (const context of ["preview", "workspace", "recorded"]) assert.match(browserServerCommand(context, 3119, "1"), /next dev/);
  assert.throws(() => browserServerCommand("public", 3119, "invalid"), /must be 0 or 1/);
  assert.throws(() => browserServerCommand("public", "3119;echo bad", "0"), /valid loopback server port/);
});

test("discovery rejects absent, extra, renamed, or duplicate cases and unknown contexts", () => {
  assert.deepEqual(validateDiscovery(manifest, report("passed")), { specs: 1, cases: 1 });
  assert.throws(() => validateDiscovery(manifest, { suites: [] }), /Every discovered case/);
  const extra = report("passed"); extra.suites[0].specs.push(...extra.suites[0].specs);
  assert.throws(() => validateDiscovery(manifest, extra), /Every discovered case/);
  const renamed = report("passed"); renamed.suites[0].specs[0].title = "Unrecorded change";
  assert.throws(() => validateDiscovery(manifest, renamed), /Every discovered case/);
  assert.throws(() => validateDiscovery({ ...manifest, entries: [{ ...manifest.entries[0], context: "unknown" }] }, report("passed")), /Unknown context/);
});

test("required result rejects skips, absent execution, and failures", () => {
  assert.equal(validateContextResult(manifest, "preview", report("passed")), 1);
  for (const status of ["skipped", "failed", "interrupted", "timedOut"]) assert.throws(() => validateContextResult(manifest, "preview", report(status)), /Required preview case/);
  const missing = report("passed"); missing.suites[0].specs[0].tests[0].results = [];
  assert.throws(() => validateContextResult(manifest, "preview", missing), /No execution result/);
  assert.throws(() => validateContextResult(manifest, "preview", { suites: [], errors: [{ message: "Collection failed" }] }), /collection\/report errors/);
});

test("native cases must remain admitted by their owned profile identity", () => {
  const native = { version: 1, entries: [{ ...manifest.entries[0], context: "native" }] };
  const profiles = { native: { specs: [{ file: "tests/actual.spec.ts", cases: [{ title: "Actual case", project: "desktop" }] }] }, dark: { specs: [] }, private: { specs: [] } };
  validateNativeOwnership(native, profiles);
  assert.throws(() => validateNativeOwnership(native, { ...profiles, native: { specs: [] } }), /Required native case is absent/);
  assert.throws(() => validateNativeOwnership(native, { ...profiles, native: { specs: [{ file: "tests/actual.spec.ts", cases: [{ title: "Different case", project: "desktop" }] }] } }), /Required native case is absent/);
});

test("only the original public skips can remain skipped", () => {
  const existing = { version: 1, entries: [{ ...manifest.entries[0], context: "public", cases: [{ ...manifest.entries[0].cases[0], originalStatus: "skipped" }] }] };
  assert.equal(validateContextResult(existing, "public", report("skipped")), 1);
  assert.throws(() => validateContextResult({ ...manifest, entries: [{ ...manifest.entries[0], context: "public" }] }, "public", report("skipped")), /Required public case/);
});

test("disposable routes use actual fixture bytes, have preview guards, clean up, and refuse existing targets", () => {
  const root = mkdtempSync(join(tmpdir(), "strelva-browser-context-test-"));
  try {
    mkdirSync(join(root, "src/app/preview/strelva"), { recursive: true });
    mkdirSync(join(root, "tests/fixtures"), { recursive: true });
    for (const [, source] of proofRoutes) writeFileSync(join(root, "tests/fixtures", source), `// Actual fixture: ${source}\n`);
    const cleanup = installProofRoutes(root);
    for (const [route, source] of proofRoutes) {
      assert.equal(readFileSync(join(root, "src/app/preview/strelva", route, "Proof.tsx"), "utf8"), readFileSync(join(root, "tests/fixtures", source), "utf8"));
      assert.match(readFileSync(join(root, "src/app/preview/strelva", route, "page.tsx"), "utf8"), /NODE_ENV !== "development".*STRELVA_UI_PREVIEW !== "1"/);
    }
    cleanup(); cleanup();
    mkdirSync(join(root, "src/app/preview/strelva", proofRoutes[1][0]));
    assert.throws(() => installProofRoutes(root), /Refusing to replace existing proof route/);
  } finally { rmSync(root, { recursive: true }); }
});


test("recorded replay preserves only observed values and labels unknowns without promoting them", () => {
  assert(contexts.includes("recorded"));
  assert.deepEqual(recordedProductionRelease.flags, {
    STRELVA_WORKSPACE_RELEASE: "1", STRELVA_BUSINESS_SIGNUP_RELEASE: "1",
    STRELVA_AGENCY_SIGNUP_RELEASE: "1", STRELVA_AGENCY_ADD_CLIENT_RELEASE: "1",
    STRELVA_CLAIM_REVIEW_RELEASE: "1", STRELVA_WEBSITE_REBUILD_RELEASE: "1", STRELVA_NEEDS_YOU_RELEASE: "0",
  });
  assert.equal(recordedProductionRelease.recordedAt, "2026-10-14");
  assert.deepEqual(recordedProductionRelease.unknown, ["Systems", "Ask", "AI cap", "email", "model calls"]);
  const env = browserContextEnvironment("recorded");
  assert.equal(env.STRELVA_UI_PREVIEW, "0");
  assert.equal(env.STRELVA_WORKSPACE_RELEASE, "1");
  assert.equal(env.STRELVA_NEEDS_YOU_RELEASE, "0");
  for (const key of ["STRELVA_SYSTEMS_RELEASE", "STRELVA_ASK_RELEASE", "STRELVA_FREE_MONTHLY_AI_CAP_USD", "STRELVA_WEBSITE_MODEL_CALLS_ENABLED"]) {
    assert.equal(env[key], "0");
    assert.equal(recordedProductionRelease.flags[key], undefined);
  }
  for (const key of ["EMAIL_SENDING_ENABLED", "CUSTOMER_EMAIL_ENABLED", "OPERATOR_EMAILS_ENABLED", "PROSPECT_EMAILS_ENABLED"]) assert.equal(env[key], "false");
  assert.deepEqual(browserContextEnvironment("public"), { ...localBrowserSafetyEnvironment, STRELVA_UI_PREVIEW: "0", STRELVA_WORKSPACE_RELEASE: "0" });
  assert.deepEqual(browserContextEnvironment("preview"), { ...localBrowserSafetyEnvironment, STRELVA_UI_PREVIEW: "1", STRELVA_WORKSPACE_RELEASE: "1" });
  assert.throws(() => browserContextEnvironment("typo"), /Unknown browser context/);
});

test("recorded replay cases are mandatory and cannot inherit public skip exemptions", () => {
  const recorded = { version: 1, entries: [{ ...manifest.entries[0], context: "recorded", cases: [{ ...manifest.entries[0].cases[0], originalStatus: "skipped" }] }] };
  assert.equal(validateContextResult(recorded, "recorded", report("passed")), 1);
  assert.throws(() => validateContextResult(recorded, "recorded", report("skipped")), /Required recorded case/);
  const rootManifest = JSON.parse(readFileSync(new URL("../browser-ci-manifest.json", import.meta.url), "utf8"));
  assert.equal(rootManifest.entries.find(entry => entry.file === "agency-signup.spec.ts").context, "recorded");
  assert.equal(rootManifest.entries.find(entry => entry.file === "application-review-fixture.spec.ts").context, "workspace");
  assert.equal(rootManifest.entries.find(entry => entry.file === "release-1-0-preview-journeys.spec.ts").context, "preview");
});
