import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import manifest from "../../scripts/release-safety/batches.json";
import { verifyReleaseInventory } from "../../scripts/release-safety/inventory";
import { RELEASE_PACKET } from "../../scripts/stage-release-batch";

type HeldMigration = {
  file: string;
  sha256: string;
  rollback?: string;
  rollbackSha256?: string;
  rollbackStatus?: string;
};

const read = (file: string) => readFileSync(file, "utf8");
const uxFiles = () => readdirSync("supabase/migrations").filter(file => /^202610241[23]\d{4}_.*\.sql$/.test(file)).sort();

describe("UX audit migration integration", () => {
  it("pins every forward and inverse as held without expanding a qualified historical ledger or packet", () => {
    const tails = manifest.proposed.filter(entry => entry.id?.startsWith("ux-audit"));
    expect(tails.map(entry => entry.id)).toEqual(["ux-audit-2026-10-12", "ux-audit-pass2-owner2-2026-10-12"]);
    for (const tail of tails) {
      expect(tail.status).toContain("held and unqualified");
      expect(tail.status).toContain("UNRUN/held");
      expect("batch" in tail).toBe(false);
      expect(tail.items.map(item => item.file)).toEqual(tail.items.map(item => item.file).sort());
    }
    const items: HeldMigration[] = [];
    for (const tail of tails) items.push(...tail.items);
    expect(uxFiles()).toHaveLength(17);
    expect(items.map(item => item.file).sort()).toEqual(uxFiles());
    for (const item of items) {
      if (typeof item.rollback !== "string" || typeof item.rollbackSha256 !== "string" || typeof item.rollbackStatus !== "string") throw new Error(`Unpinned UX inverse: ${item.file}`);
      expect(item.rollback).toBe(`rollback-${item.file}`);
      expect(item.rollbackStatus).toContain("No production application authorized");
      for (const [file, pin] of [[item.file, item.sha256], [item.rollback, item.rollbackSha256]]) {
        expect(createHash("sha256").update(readFileSync(`supabase/migrations/${file}`)).digest("hex")).toBe(pin);
      }
    }
    expect(RELEASE_PACKET.flatMap(step => step.items.map(item => item.file)).some(file => uxFiles().includes(file))).toBe(false);
    expect(JSON.parse(read("scripts/sql/historical-forward-inventory.json")).forwardCount).toBe(354);
    expect(() => verifyReleaseInventory(process.cwd())).not.toThrow();
  });

  it("composes every native UX fixture and retained lane runner into the existing SQL owners", () => {
    const owner = read("scripts/check-ux-audit-sql.sh");
    const fixtures = ["ux-owner-setup-ask-schema", "ux-owner-agency-access-schema", "ux-owner-export-history", "agency-full-control-decisions-schema", "chrome-recorded-actors", "ux-integration-booking-actor-schema", "agency-qualification-schema"];
    for (const fixture of fixtures) expect(owner).toContain(fixture);
    expect(owner).toContain("fingerprint before");
    expect(owner).toContain('apply "$repo_root/supabase/migrations/rollback-$migration_name"');
    expect(owner).toContain("fingerprint inverse");
    expect(owner).toContain("fingerprint reapplied");
    for (const runner of ["check-ux-trust-email-sql.sh", "check-ux-trust-ui-budget-sql.sh", "check-ux-owner-agency-access-sql.sh", "check-agency-qualification-sql.sh", "check-ux-owner2-sql.sh", "check-ux-agency-proposal-identity-sql.sh", "check-ux-agency-native-pages-sql.sh", "check-agency2-decisions-sql.sh"]) {
      expect(owner).toContain(runner);
      expect(read(`scripts/${runner}`)).not.toContain("REB-ux-");
    }
    for (const script of ["scripts/check-workspace-sql.sh", "scripts/check-workspace-upgrade.sh", "scripts/check-agency-workflow-sql.sh"]) {
      expect(read(script)).toContain('bash "$repo_root/scripts/check-ux-audit-sql.sh"');
    }
    expect(read("scripts/check-workspace-upgrade.sh")).toContain('"$migration_name" == 20261024*');
    expect(read("scripts/check-agency-workflow-sql.sh")).toContain('"$(basename "$migration")" == 20261024*');
  });
});
