import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { assertNoValues, buildReport, formatReport, main, scanEnvNames } from "../../scripts/prod-flag-report";
import { parseRolloutEnv } from "../../scripts/silent-rollout";

const fixture = [
  "STRELVA_SYSTEMS_RELEASE=workspace",
  "STRELVA_WORKSPACE_RELEASE=1",
  "EMAIL_SENDING_ENABLED=true",
  "RESEND_API_KEY=re_fixture_value_123456",
  "STRELVA_ASK_COST_ALERT_USD=25",
  "OLD_THING=x",
].join("\n");

describe("prod flag report", () => {
  const scanned = scanEnvNames(process.cwd());
  const env = parseRolloutEnv(fixture);
  const output = formatReport(buildReport(env, scanned));

  it("prints names with normalized states and never a value", () => {
    expect(output).toContain("STRELVA_SYSTEMS_RELEASE: workspace");
    expect(output).toContain("STRELVA_WORKSPACE_RELEASE: on");
    expect(output).toContain("RESEND_API_KEY: set");
    expect(output).toContain("STRELVA_ASK_COST_ALERT_USD: set (value hidden)");
    expect(output).toContain("STOP: EMAIL_SENDING_ENABLED");
    expect(output).toMatch(/In env file but unused by this source\n\s+OLD_THING/);
    expect(output).not.toContain("re_fixture_value_123456");
    expect(output).not.toMatch(/\b25\b/);
    expect(() => assertNoValues(output, env)).not.toThrow();
  });

  it("refuses output that contains a value", () => {
    expect(() => assertNoValues("leaked re_fixture_value_123456", env)).toThrow();
  });

  it("passes on a pulled Vercel file whose values echo parts of printed names", () => {
    const pulled = parseRolloutEnv(["VERCEL_ENV=production", "NODE_ENV=production", "STRELVA_PLAN=strelva", "EMAIL_SENDING_ENABLED=false"].join("\n"));
    const text = formatReport(buildReport(pulled, scanned));
    expect(() => assertNoValues(text, pulled)).not.toThrow();
    expect(() => assertNoValues(JSON.stringify(buildReport(pulled, scanned), null, 2), pulled)).not.toThrow();
  });

  it("still throws on a crafted row that leaks a value", () => {
    const pulled = parseRolloutEnv("VERCEL_ENV=production\nSTRELVA_PLAN=strelva");
    expect(() => assertNoValues("  STRELVA_PLAN: strelva", pulled)).toThrow();
    expect(() => assertNoValues("  STRELVA_PLAN: set  (strelva)\nnote production", pulled)).toThrow();
  });

  it("derives the inventory from source, including flags the readiness snapshot misses", () => {
    expect(scanned).toContain("STRELVA_AGENCY_ADD_CLIENT_RELEASE");
    expect(scanned).toContain("NEXT_PUBLIC_SENTRY_DSN");
  });

  it("is safe when nothing client-facing is on", () => {
    expect(formatReport(buildReport({ EMAIL_SENDING_ENABLED: "false" }, scanned))).toContain("Silent rollout: safe");
  });

  it("requires --env-file and exits 1 on a stop", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(main([])).toBe(2);
    error.mockRestore();
    const file = join(mkdtempSync(join(tmpdir(), "flags-")), "env");
    writeFileSync(file, fixture);
    const log = vi.fn();
    expect(main(["--env-file", file], log)).toBe(1);
    expect(log.mock.calls.join("\n")).not.toContain("re_fixture_value_123456");
    expect(main(["--env-file", file, "--json"], log)).toBe(1);
    const leaky = join(mkdtempSync(join(tmpdir(), "flags-")), "env");
    writeFileSync(leaky, "OLD_THING=x\nMYSTERY=secretvalue\nsecretvalue=secretvalue");
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = vi.fn();
    expect(main(["--env-file", leaky], out)).toBe(3);
    quiet.mockRestore();
  });
});
