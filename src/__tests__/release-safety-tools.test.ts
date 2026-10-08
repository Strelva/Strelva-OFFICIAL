import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { CLIENT_SEND_FLAGS, parseRolloutEnv, silentRolloutEnvStops } from "../../scripts/silent-rollout";
import { verifyReleaseInventory } from "../../scripts/release-safety/inventory";
import { RELEASE_BASELINE, RELEASE_PACKET, stageReleaseBatch } from "../../scripts/stage-release-batch";

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
  it("names both files when a migration version is reused, even before packet classification", () => {
    const repo = temp();
    const migrations = join(repo, "supabase/migrations");
    mkdirSync(migrations, { recursive: true });
    writeFileSync(join(migrations, "20261013220000_provider_seat_tenant_conversion.sql"), "select 1;");
    writeFileSync(join(migrations, "20261013220000_inquiry_lead_retention.sql"), "select 1;");
    expect(() => verifyReleaseInventory(repo)).toThrow(/20261013220000_inquiry_lead_retention.sql, 20261013220000_provider_seat_tenant_conversion.sql/);
    const out = join(temp(), "duplicate-stage");
    expect(() => stageReleaseBatch({ repoRoot: repo, out, batch: 0, appliedVersions: RELEASE_BASELINE.map(({ file }) => file.slice(0, 14)) })).toThrow(/Duplicate migration version/);
    expect(existsSync(out)).toBe(false);
  });
  it("requires every integrated migration to have one pinned packet entry", () => {
    expect(() => verifyReleaseInventory(process.cwd())).not.toThrow();
  });
  it("pins H between 0 and 1 and the proposed tail after 7", () => {
    expect(RELEASE_PACKET.map(step => step.batch)).toEqual([0,"H",1,2,3,4,5,6,7,"7A","8","9","10","11","12","13","14","15","17"]);
  });
  it.each(RELEASE_PACKET)("stages precisely pending batch $batch plus its packet prerequisites", (step) => {
    const batch = step.batch;
    const stepIndex = RELEASE_PACKET.findIndex(item => item.batch === batch);
    const prior = [...RELEASE_BASELINE, ...RELEASE_PACKET.slice(0, stepIndex).flatMap(step => step.items)];
    const out = join(temp(), "batch");
    const receipt = stageReleaseBatch({ repoRoot: process.cwd(), out, batch, appliedVersions: prior.map(({ file }) => file.slice(0, 14)) });
    const staged = readdirSync(join(out, "supabase/migrations"));
    expect(staged).toEqual([...prior, ...step.items].map(({ file }) => file).sort());
    expect(receipt.pending).toEqual(step.items.map(({ file }) => file));
    expect(receipt.requiredAppliedVersions).toEqual(prior.map(({ file }) => file.slice(0,14)).sort());
    expect(receipt.qualification).toBe(typeof batch === "string" ? "proposed" : "prepared");
    expect(receipt.manifestStatus).toBe(step.manifestStatus);
    expect(receipt.deploymentAuthorized).toBe(false);
    expect(receipt.networkAccess).toBe(false);
    expect(staged.some((f) => f.startsWith("rollback-") || f.startsWith("verify-"))).toBe(false);
    expect(JSON.parse(readFileSync(join(out, "batch-receipt.json"), "utf8"))).toEqual(receipt);
  });
  it("refuses missing prerequisites, unknown history, invalid batches and existing output", () => {
    const base = { repoRoot: process.cwd(), out: join(temp(), "out"), batch: 0, appliedVersions: RELEASE_BASELINE.map(({ file }) => file.slice(0, 14)) };
    expect(() => stageReleaseBatch({ ...base, batch: 8 })).toThrow(/Batch/);
    expect(() => stageReleaseBatch({ ...base, batch: 1 })).toThrow(/history/);
    expect(() => stageReleaseBatch({ ...base, appliedVersions: [...base.appliedVersions, "20990101000000"] })).toThrow(/history/);
    expect(() => stageReleaseBatch({ ...base, appliedVersions: base.appliedVersions.slice(1) })).toThrow(/history/);
    expect(() => stageReleaseBatch({ ...base, appliedVersions: [...base.appliedVersions, base.appliedVersions[0]!] })).toThrow(/history/);
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
    expect(() => stageReleaseBatch({ repoRoot: repo, out, batch: 0, appliedVersions: RELEASE_BASELINE.map(({ file }) => file.slice(0, 14)) })).toThrow(/digest drift/);
    expect(existsSync(out)).toBe(false);
  });
  it("requires H before batch 1 and rejects partial or future history for proposed steps", () => {
    const out = join(temp(), "missing-H");
    const withoutH = [...RELEASE_BASELINE, ...RELEASE_PACKET[0]!.items].map(({ file }) => file.slice(0,14));
    expect(() => stageReleaseBatch({ repoRoot: process.cwd(), out, batch: 1, appliedVersions: withoutH })).toThrow(/history/);
    const index = RELEASE_PACKET.findIndex(step => step.batch === "8");
    const prior = [...RELEASE_BASELINE, ...RELEASE_PACKET.slice(0,index).flatMap(step => step.items)].map(({ file }) => file.slice(0,14));
    const pending = RELEASE_PACKET[index]!.items;
    for (const appliedVersions of [prior.slice(0,-1), [...prior,pending[0]!.file.slice(0,14)], [...prior,...pending.map(item => item.file.slice(0,14))]]) {
      expect(() => stageReleaseBatch({ repoRoot: process.cwd(), out, batch: "8", appliedVersions })).toThrow(/history/);
    }
    expect(existsSync(out)).toBe(false);
  });
  it("verifies future packet digests before creating output for an earlier batch", () => {
    const repo = temp();
    cpSync(join(process.cwd(),"supabase/migrations"),join(repo,"supabase/migrations"),{recursive:true});
    const future = RELEASE_PACKET.find(step => step.batch === "9")!.items[0]!;
    writeFileSync(join(repo,"supabase/migrations",future.file),"select 'future drift';");
    const out = join(temp(),"earlier-batch");
    expect(() => stageReleaseBatch({ repoRoot: repo,out,batch:0,appliedVersions:RELEASE_BASELINE.map(item => item.file.slice(0,14)) })).toThrow(new RegExp("digest drift: " + future.file));
    expect(existsSync(out)).toBe(false);
  });
  it("the CLI accepts an exact proposed ID without granting deployment authority", () => {
    const prior = [...RELEASE_BASELINE,...RELEASE_PACKET.slice(0,1).flatMap(step => step.items)];
    const history = join(temp(),"history.json");writeFileSync(history,JSON.stringify(prior.map(item => item.file.slice(0,14))));
    const out = join(temp(),"hotfix");
    const result = spawnSync(process.execPath,["--import","tsx","scripts/stage-release-batch.ts","--batch","H","--applied-versions",history,"--out",out],{encoding:"utf8"});
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Qualification: proposed");
    expect(result.stdout).toContain("No network access or deployment authority");
    expect(JSON.parse(readFileSync(join(out,"batch-receipt.json"),"utf8"))).toMatchObject({batch:"H",qualification:"proposed",deploymentAuthorized:false});
    const invalid = spawnSync(process.execPath,["--import","tsx","scripts/stage-release-batch.ts","--batch","08","--applied-versions",history,"--out",join(temp(),"invalid")],{encoding:"utf8"});
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toContain("Batch must");
  });
});
