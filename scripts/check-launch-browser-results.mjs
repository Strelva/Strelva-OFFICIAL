import { readFileSync } from "node:fs";
const report = process.argv[2];
if (!report) throw new Error("Supply the retained Playwright JSON report.");
const result = JSON.parse(readFileSync(report, "utf8"));
const stats = result.stats;
if (!stats || !Number.isInteger(stats.expected) || stats.expected < 5 || stats.skipped !== 0 || stats.unexpected !== 0 || stats.flaky !== 0 || result.errors?.length) {
  console.error("Critical launch journeys did not all execute and pass without retries.", stats || "No statistics");
  process.exitCode = 1;
} else console.log(`${stats.expected} isolated Auth/browser journeys passed. No hosted release is implied.`);
