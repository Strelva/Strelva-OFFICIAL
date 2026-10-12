import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { browserServerCommand, installProofRoutes, proofRoutes, validateContextResult, validateDiscovery, validateNativeOwnership } from "../browser-ci-contexts.mjs";

const manifest = { version: 1, entries: [{ file: "actual.spec.ts", context: "preview", cases: [{ title: "Actual case", project: "desktop", originalStatus: "passed" }] }] };
const report = status => ({ suites: [{ specs: [{ file: "actual.spec.ts", title: "Actual case", tests: [{ projectName: "desktop", expectedStatus: "passed", results: [{ status }] }] }] }] });

test("public proof retains the requested built app while fictional contexts require dev", () => {
  assert.match(browserServerCommand("public", 3119, "1"), /next start --hostname 127\.0\.0\.1 --port 3119$/);
  assert.match(browserServerCommand("public", 3119, "0"), /next dev/);
  for (const context of ["preview", "workspace"]) assert.match(browserServerCommand(context, 3119, "1"), /next dev/);
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
