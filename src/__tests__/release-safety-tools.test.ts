import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { CLIENT_SEND_FLAGS, parseRolloutEnv, silentRolloutEnvStops } from "../../scripts/silent-rollout";
import { verifyReleaseInventory } from "../../scripts/release-safety/inventory";
import { RELEASE_BASELINE, RELEASE_BATCHES, stageReleaseBatch } from "../../scripts/stage-release-batch";

const temps: string[] = [];
const temp = () => { const dir = mkdtempSync(join(tmpdir(), "strelva-release-tools-")); temps.push(dir); return dir; };
afterEach(() => { for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe("silent rollout preflight", () => {
  it.each(CLIENT_SEND_FLAGS)("blocks %s independently, including workspace exposure and malformed values", (flag) => {
    for (const value of ["true", "1", "on", "workspace", "operators", "unexpected-secret"]) {
      expect(silentRolloutEnvStops({ [flag]: value })).toEqual([`${flag} must be absent or off for a silent rollout.`]);
    }
    for (const value of [undefined, "", "false", "0", "off"]) expect(silentRolloutEnvStops({ [flag]: value })).toEqual([]);
  });
  it("accepts a literal complete env, preserves operator policy and hides secrets", () => {
    const env = parseRolloutEnv('# Intended step\nexport EMAIL_SENDING_ENABLED="false" # stopped\nCUSTOMER_EMAIL_ENABLED=\'false\'\nSTRELVA_SYSTEMS_RELEASE=workspace\nRESEND_API_KEY=private-value\n');
    expect(silentRolloutEnvStops(env)).toEqual([]);
    expect(silentRolloutEnvStops({ OPERATOR_EMAILS_ENABLED: "true" })).toEqual([]);
    expect(() => parseRolloutEnv("EMAIL_SENDING_ENABLED=false\nEMAIL_SENDING_ENABLED=true")).toThrow(/Duplicate/);
    expect(() => parseRolloutEnv("EMAIL_SENDING_ENABLED=${SEND}")).toThrow(/expansion/);
    expect(() => parseRolloutEnv("EMAIL_SENDING_ENABLED=\"false")).toThrow(/quoted/);
    expect(() => parseRolloutEnv("invalid line")).toThrow(/assignment/);
  });
  it("the CLI exits nonzero for a proposed send and prints no env value", () => {
    const file = join(temp(), "step.env");
    writeFileSync(file, "CUSTOMER_EMAIL_ENABLED=true\nRESEND_API_KEY=never-print-this\n");
    const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/silent-rollout-preflight.ts", "--env-file", file], { encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("STOP:");
    expect(result.stdout + result.stderr).not.toContain("never-print-this");
    writeFileSync(file, "EMAIL_SENDING_ENABLED=false\nCUSTOMER_EMAIL_ENABLED=false\n");
    expect(spawnSync(process.execPath, ["--import", "tsx", "scripts/silent-rollout-preflight.ts", "--env-file", file]).status).toBe(0);
  }, 120_000);
});

describe("offline batch staging", () => {
  it("requires every integrated migration to have one pinned packet entry", () => {
    expect(() => verifyReleaseInventory(process.cwd())).not.toThrow();
  });
  it.each(RELEASE_BATCHES.map((_, i) => i))("stages precisely the pending batch %i plus its applied prerequisites", (batch) => {
    const prior = [...RELEASE_BASELINE, ...RELEASE_BATCHES.slice(0, batch).flat()];
    const out = join(temp(), "batch");
    const receipt = stageReleaseBatch({ repoRoot: process.cwd(), out, batch, appliedVersions: prior.map(({ file }) => file.slice(0, 14)) });
    const staged = readdirSync(join(out, "supabase/migrations"));
    expect(staged).toEqual([...prior, ...RELEASE_BATCHES[batch]!].map(({ file }) => file).sort());
    expect(receipt.pending).toEqual(RELEASE_BATCHES[batch]!.map(({ file }) => file));
    expect(staged.some((f) => f.startsWith("rollback-") || f.startsWith("verify-"))).toBe(false);
    expect(JSON.parse(readFileSync(join(out, "batch-receipt.json"), "utf8"))).toEqual(receipt);
  });
  it("refuses missing prerequisites, unknown history, invalid batches and existing output", () => {
    const base = { repoRoot: process.cwd(), out: join(temp(), "out"), batch: 0, appliedVersions: RELEASE_BASELINE.map(({ file }) => file.slice(0, 14)) };
    expect(() => stageReleaseBatch({ ...base, batch: 8 })).toThrow(/Batch/);
    expect(() => stageReleaseBatch({ ...base, batch: 1 })).toThrow(/history/);
    expect(() => stageReleaseBatch({ ...base, appliedVersions: [...base.appliedVersions, "20990101000000"] })).toThrow(/history/);
    expect(() => stageReleaseBatch({ ...base, appliedVersions: base.appliedVersions.slice(1) })).toThrow(/history/);
    stageReleaseBatch(base);
    expect(() => stageReleaseBatch(base)).toThrow(/fresh/);
  });
  it("fails before staging on SQL digest drift and makes no network or process call", () => {
    const source = readFileSync("scripts/stage-release-batch.ts", "utf8");
    expect(source).not.toMatch(/fetch\(|child_process|supabase-js|@upstash|https?:\/\//);
    const repo = temp();
    // One corrupted first baseline file is enough to prove fail-before-write.
    const file = RELEASE_BASELINE[0]!.file;
    const out = join(temp(), "batch");
    // This deliberately uses a minimal fixture: the digest failure precedes config or other reads.
    mkdirSync(join(repo, "supabase/migrations"), { recursive: true });
    writeFileSync(join(repo, "supabase/migrations", file), "select 'drift';");
    expect(() => stageReleaseBatch({ repoRoot: repo, out, batch: 0, appliedVersions: RELEASE_BASELINE.map(({ file }) => file.slice(0, 14)) })).toThrow(/Digest mismatch/);
  });
});
