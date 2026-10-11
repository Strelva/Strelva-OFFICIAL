import { readFileSync } from "node:fs";
const report = process.argv[2];
const profile = process.argv[3] || "core";
if (!report) throw new Error("Supply the retained Playwright JSON report.");
const core = [
  ["launch-business-authenticated-local.spec.ts", 2],
  ["application-use-authenticated-local.spec.ts", 2],
  ["onboarding-authenticated-local.spec.ts", 1],
  ["service-request-authenticated-local.spec.ts", 1],
];
// pnpm check:journeys: the 1.0 journeys with flags on, then today's journeys and the dark 1.0 surfaces with flags off.
const profiles = {
  core,
  "neutral-on": [["agency-neutral-authenticated-local.spec.ts", 1]],
  "neutral-off": [["agency-neutral-authenticated-local.spec.ts", 1]],
  marketing: [["marketing-launch-authenticated-local.spec.ts", 6]],
  "journeys-on": [
    ["owner-journey-1-0-authenticated-local.spec.ts", 2],
    ["operator-queue-authenticated-local.spec.ts", 2],
    ["make-real-authenticated-local.spec.ts", 1],
    ["booking-approval-authenticated-local.spec.ts", 3],
    ["email-only-owner-authenticated-local.spec.ts", 2],
    ["versions-authenticated-local.spec.ts", 1],
    ["inquiries-1-0-authenticated-local.spec.ts", 1],
    ["agency-neutral-authenticated-local.spec.ts", 1],
  ],
  "journeys-off": [
    ["release-1-0-flags-off-authenticated-local.spec.ts", 1],
    ["agency-neutral-authenticated-local.spec.ts", 1],
    ["launch-business-authenticated-local.spec.ts", 2],
    ["application-use-authenticated-local.spec.ts", 3],
    ["onboarding-authenticated-local.spec.ts", 1],
    ["service-request-authenticated-local.spec.ts", 1],
  ],
};
if (!profiles[profile]) throw new Error("Unknown launch verification profile.");
const result = JSON.parse(readFileSync(report, "utf8"));
const stats = result.stats;
const required = new Map(profiles[profile]);
const executed = new Map();
function visit(suite) {
  for (const spec of suite.specs || []) {
    const file = String(spec.file || "").split(/[\\/]/).pop();
    const passed = (spec.tests || []).filter(test => test.status === "expected"
      && Array.isArray(test.results) && test.results.length === 1
      && test.results[0].status === "passed" && (test.results[0].retry ?? 0) === 0);
    executed.set(file, (executed.get(file) || 0) + passed.length);
  }
  for (const child of suite.suites || []) visit(child);
}
visit(result);
const minimumExpected = [...required.values()].reduce((total, count) => total + count, 0);
const missing = [...required].filter(([file, minimum]) => (executed.get(file) || 0) < minimum).map(([file]) => file);
if (!stats || !Number.isInteger(stats.expected) || stats.expected < minimumExpected || stats.skipped !== 0 || stats.unexpected !== 0 || stats.flaky !== 0 || result.errors?.length || missing.length) {
  console.error("Critical launch journeys did not all execute and pass without retries.", { stats: stats || "No statistics", missing });
  process.exitCode = 1;
} else console.log(`${stats.expected} isolated ${profile} Auth/browser journeys passed. No hosted release is implied.`);
