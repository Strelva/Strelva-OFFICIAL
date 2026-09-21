import { readFileSync } from "node:fs";
const report = process.argv[2];
if (!report) throw new Error("Supply the retained Playwright JSON report.");
const result = JSON.parse(readFileSync(report, "utf8"));
const stats = result.stats;
const required = new Map([
  ["launch-business-authenticated-local.spec.ts", 2],
  ["application-use-authenticated-local.spec.ts", 2],
  ["onboarding-authenticated-local.spec.ts", 1],
  ["service-request-authenticated-local.spec.ts", 1],
]);
const executed = new Map();
function visit(suite) {
  for (const spec of suite.specs || []) {
    const file = String(spec.file || "").split(/[\\/]/).pop();
    executed.set(file, (executed.get(file) || 0) + (spec.tests || []).filter(test => test.status === "expected" && test.results?.every(run => run.status === "passed")).length);
  }
  for (const child of suite.suites || []) visit(child);
}
visit(result);
const missing = [...required].filter(([file, minimum]) => (executed.get(file) || 0) < minimum).map(([file]) => file);
if (!stats || !Number.isInteger(stats.expected) || stats.expected < 6 || stats.skipped !== 0 || stats.unexpected !== 0 || stats.flaky !== 0 || result.errors?.length || missing.length) {
  console.error("Critical launch journeys did not all execute and pass without retries.", { stats: stats || "No statistics", missing });
  process.exitCode = 1;
} else console.log(`${stats.expected} isolated Auth/browser journeys passed. No hosted release is implied.`);
