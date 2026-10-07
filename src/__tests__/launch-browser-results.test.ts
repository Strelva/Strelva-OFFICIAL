import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const directories: string[] = [];
const core = [
  ["launch-business-authenticated-local.spec.ts", 2],
  ["application-use-authenticated-local.spec.ts", 2],
  ["onboarding-authenticated-local.spec.ts", 1],
  ["service-request-authenticated-local.spec.ts", 1],
] as const;
const profiles = {
  core,
  marketing: [["marketing-launch-authenticated-local.spec.ts", 6]],
  "journeys-on": [
    ["owner-journey-1-0-authenticated-local.spec.ts", 2],
    ["operator-queue-authenticated-local.spec.ts", 2],
    ["make-real-authenticated-local.spec.ts", 1],
    ["booking-approval-authenticated-local.spec.ts", 3],
    ["email-only-owner-authenticated-local.spec.ts", 2],
    ["versions-authenticated-local.spec.ts", 1],
    ["inquiries-1-0-authenticated-local.spec.ts", 1],
  ],
  "journeys-off": [
    ["release-1-0-flags-off-authenticated-local.spec.ts", 1],
    ["launch-business-authenticated-local.spec.ts", 2],
    ["application-use-authenticated-local.spec.ts", 3],
    ["onboarding-authenticated-local.spec.ts", 1],
    ["service-request-authenticated-local.spec.ts", 1],
  ],
} as const;
function report(profile: keyof typeof profiles = "core") {
  const counts = profiles[profile];
  return {
    stats: { expected: counts.reduce((total, [, count]) => total + count, 0), skipped: 0, unexpected: 0, flaky: 0 },
    errors: [] as string[],
    suites: [{ specs: counts.flatMap(([file, count]) => Array.from({ length: count }, () => ({
      file, tests: [{ status: "expected", results: [{ status: "passed", retry: 0 }] }],
    }))) }],
  };
}
function run(value: unknown, profile?: string) {
  const directory = mkdtempSync(join(tmpdir(), "strelva-browser-gate-"));
  directories.push(directory);
  const file = join(directory, "report.json");
  writeFileSync(file, JSON.stringify(value));
  return spawnSync(process.execPath, [resolve("scripts/check-launch-browser-results.mjs"), file, ...(profile ? [profile] : [])], { encoding: "utf8", timeout: 10_000 });
}
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

describe("critical browser proof gate", () => {
  it("requires all core journeys by default", () => expect(run(report()).status).toBe(0));
  it("accepts six executed marketing-to-product journeys under their own profile", () => expect(run(report("marketing"), "marketing").status).toBe(0));
  it("does not substitute marketing entry proof for native product proof", () => expect(run(report("marketing")).status).toBe(1));
  it("rejects unknown profiles", () => expect(run(report(), "unknown").status).toBe(1));
  it.each(["skipped", "unexpected", "flaky"] as const)("rejects %s outcomes even with green expected counts", kind => {
    const value = report(); value.stats[kind] = 1;
    expect(run(value).status).toBe(1);
  });
  it("rejects a test without an executed result", () => {
    const value = report(); value.suites[0]!.specs[0]!.tests[0]!.results = [];
    expect(run(value).status).toBe(1);
  });
  it("rejects multiple attempts instead of counting a retry as clean proof", () => {
    const value = report(); value.suites[0]!.specs[0]!.tests[0]!.results.push({ status: "passed", retry: 1 });
    expect(run(value).status).toBe(1);
  });
  it("rejects a retained result from a retry", () => {
    const value = report(); value.suites[0]!.specs[0]!.tests[0]!.results[0]!.retry = 1;
    expect(run(value).status).toBe(1);
  });
  it("rejects global errors", () => {
    const value = report(); value.errors.push("Synthetic process failure");
    expect(run(value).status).toBe(1);
  });
  it("requires all six marketing entries even when summary counts claim success", () => {
    const value = report("marketing"); value.suites[0]!.specs.pop();
    expect(run(value, "marketing").status).toBe(1);
  });
  it.each(["journeys-on", "journeys-off"] as const)("accepts a complete %s run", profile => {
    expect(run(report(profile), profile).status).toBe(0);
  });
  for (const profile of ["journeys-on", "journeys-off"] as const) {
    it.each(profiles[profile].map(([file]) => file))(`rejects an omitted %s test in ${profile} even with green summary counts`, file => {
      const value = report(profile);
      const index = value.suites[0]!.specs.findIndex(spec => spec.file === file);
      value.suites[0]!.specs.splice(index, 1);
      expect(run(value, profile).status).toBe(1);
    });
  }
});
