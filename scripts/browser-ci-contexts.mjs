import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const contexts = ["public", "preview", "workspace", "native", "dark", "private"];
export function browserServerCommand(context, port, builtApp = "0") {
  assert(["0", "1"].includes(builtApp), "PLAYWRIGHT_BUILT_APP must be 0 or 1.");
  assert(/^\d+$/.test(String(port)) && Number(port) > 0 && Number(port) <= 65535, "A valid loopback server port is required.");
  return context === "public" && builtApp === "1"
    ? `pnpm exec next start --hostname 127.0.0.1 --port ${port}`
    : `PLAYWRIGHT_DIST_DIR=.next-playwright pnpm exec next dev --hostname 127.0.0.1 --port ${port}`;
}
export const proofRoutes = [
  ["architecture-union-proof", "architecture-union-page.tsx"],
  ["architecture-union-inquiry-proof", "architecture-union-inquiry-page.tsx"],
  ["opened-work-proof", "opened-work-composition-page.tsx"],
];

export function casesInReport(report) {
  const entries = [];
  function visit(suite) {
    for (const spec of suite.specs || []) for (const test of spec.tests || []) entries.push({ file: spec.file, title: spec.title, project: test.projectName, originalStatus: test.expectedStatus, test });
    for (const child of suite.suites || []) visit(child);
  }
  for (const suite of report.suites || []) visit(suite);
  assert.equal((report.errors || []).length, 0, "Playwright collection/report errors must not be ignored.");
  return entries;
}

const key = ({ file, title, project }) => JSON.stringify([file, title, project]);
function orderedKeys(entries) { return entries.map(key).sort(); }

export function validateDiscovery(manifest, report) {
  assert.equal(manifest.version, 1);
  assert.equal(new Set(manifest.entries.map(entry => entry.file)).size, manifest.entries.length, "Duplicate spec ownership.");
  for (const entry of manifest.entries) {
    assert(contexts.includes(entry.context), `Unknown context for ${entry.file}.`);
    assert(entry.file.endsWith(".spec.ts") && !entry.file.includes("/"), "Only exact test filenames are accepted.");
    assert(entry.cases.length > 0, `Empty spec ${entry.file}.`);
  }
  const expected = manifest.entries.flatMap(entry => entry.cases.map(value => ({ ...value, file: entry.file })));
  const actual = casesInReport(report);
  assert.deepEqual(orderedKeys(actual), orderedKeys(expected), "Every discovered case must have exactly one recorded context; update the manifest explicitly for added/removed/renamed cases.");
  for (const value of expected) {
    const observed = actual.find(item => key(item) === key(value));
    assert.equal(observed.originalStatus, value.originalStatus, `Original gate status changed for ${value.file}: ${value.title}.`);
  }
  return { specs: manifest.entries.length, cases: expected.length };
}

export function validateNativeOwnership(manifest, profiles) {
  for (const context of ["native", "dark", "private"]) {
    const assigned = manifest.entries.filter(entry => entry.context === context).flatMap(entry => entry.cases.map(value => ({ ...value, file: entry.file })));
    const admitted = profiles[context].specs.flatMap(spec => (spec.cases || [{ title: spec.title, project: "desktop" }]).map(value => ({ ...value, file: spec.file.replace(/^tests\//, "") })));
    for (const value of assigned) assert(admitted.some(item => key(item) === key(value)), `Required native case is absent from the owned ${context} profile: ${value.file}: ${value.title}.`);
  }
}

export function validateContextResult(manifest, context, report) {
  const expected = manifest.entries.filter(entry => entry.context === context).flatMap(entry => entry.cases.map(value => ({ ...value, file: entry.file })));
  const actual = casesInReport(report);
  assert.deepEqual(orderedKeys(actual), orderedKeys(expected), `Missing or extra cases in ${context}.`);
  for (const item of actual) {
    const original = expected.find(value => key(value) === key(item));
    const last = item.test.results.at(-1);
    assert(last, `No execution result for ${item.file}: ${item.title}.`);
    assert(last.status === "passed" || (context === "public" && original.originalStatus === "skipped" && last.status === "skipped"), `Required ${context} case did not pass: ${item.file}: ${item.title} (${last.status}).`);
  }
  return actual.length;
}

/** Disposable fixtures exist only during the explicit loopback preview run. */
export function installProofRoutes(root) {
  const owned = [];
  for (const [route, source] of proofRoutes) {
    assert(!existsSync(join(root, "src/app/preview/strelva", route)), `Refusing to replace existing proof route ${route}.`);
    assert(existsSync(join(root, "tests/fixtures", source)), `Missing actual proof fixture ${source}.`);
  }
  function cleanup() {
    for (const directory of owned.toReversed()) {
      if (!existsSync(directory)) continue;
      assert(readdirSync(directory).every(name => ["page.tsx", "Proof.tsx"].includes(name)), `Unexpected files in owned route; preserving ${directory}.`);
      rmSync(directory, { recursive: true });
    }
  }
  try {
    for (const [route, source] of proofRoutes) {
      const directory = join(root, "src/app/preview/strelva", route);
      mkdirSync(directory);
      owned.push(directory);
      writeFileSync(join(directory, "Proof.tsx"), readFileSync(join(root, "tests/fixtures", source)));
      writeFileSync(join(directory, "page.tsx"), 'import { notFound } from "next/navigation";\nimport Proof from "./Proof";\nexport default function Page() {\n  if (process.env.NODE_ENV !== "development" || process.env.STRELVA_UI_PREVIEW !== "1") notFound();\n  return <Proof />;\n}\n');
    }
  } catch (error) { cleanup(); throw error; }
  return cleanup;
}
