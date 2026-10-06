import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * Guards the deprovision table sweep against schema drift: every public table
 * that carries a tenant_id MUST be in TENANT_SCOPED_TABLES in src/lib/deprovision.ts,
 * or a deprovisioned client's rows in a new table would be silently orphaned.
 *
 * We read the lib file as text (rather than importing it) to avoid running any
 * top-level side effects. The script (scripts/deprovision-tenant.ts) delegates
 * to the lib for the actual sweep, so checking the lib is the correct gate.
 */
describe("deprovision-tenant table coverage", () => {
  const root = process.cwd();
  const types = readFileSync(join(root, "src/platform/infra/db/database.types.ts"), "utf8");
  const deprovisionLib = readFileSync(join(root, "src/lib/deprovision.ts"), "utf8");

  // Tenant-scoped tables = every `Tables` entry whose Row block contains tenant_id.
  // Scan the whole file, not a Tables:..Views: slice: the multi-schema generated
  // format (graphql_public) puts an empty Tables:/Views: pair first, which a naive
  // indexOf slice would grab. Non-public schemas here have no tenant_id rows, so a
  // whole-file scan is both correct and robust to that.
  const tablesBlock = types;
  const tenantTables: string[] = [];
  const re = /\n {6}([a-z_]+): \{\n {8}Row: \{([\s\S]*?)\n {8}\}/g;
  for (let m = re.exec(tablesBlock); m; m = re.exec(tablesBlock)) {
    if (/\btenant_id\b/.test(m[2]!)) tenantTables.push(m[1]!);
  }

  it("found a sane set of tenant-scoped tables to check against", () => {
    expect(tenantTables.length).toBeGreaterThan(20);
  });

  it("sweeps every tenant_id table (plus the tenants row itself)", () => {
    const missing = tenantTables.filter((t) => !new RegExp(`"${t}"`).test(deprovisionLib));
    expect(missing, `src/lib/deprovision.ts is missing tenant_id tables: ${missing.join(", ")}`).toEqual([]);
  });

  it("lists the tables whose sweep is undecided, outside the sweep, and lets that list only shrink", () => {
    const swept = deprovisionLib.slice(deprovisionLib.indexOf("TENANT_SCOPED_TABLES = ["), deprovisionLib.indexOf("] as const;"));
    const undecided = /TENANT_TABLES_SWEEP_UNDECIDED = \[([^\]]*)\]/.exec(deprovisionLib)?.[1] ?? "";
    const listed = [...undecided.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]!);
    const known = ["agency_managed_website_draft_grants", "agency_managed_website_draft_preparations",
      "agency_managed_website_draft_revisions", "outside_write_receipts", "report_snapshots"];
    expect(listed.every((t) => known.includes(t)), "a table was added to the undecided list; sweep it or decide instead").toBe(true);
    for (const table of listed) {
      expect(tenantTables).toContain(table);
      expect(swept).not.toContain(`"${table}"`);
    }
  });

  it("keeps workspace-owned website tables out of the sweep", () => {
    const swept = deprovisionLib.slice(deprovisionLib.indexOf("TENANT_SCOPED_TABLES = ["), deprovisionLib.indexOf("] as const;"));
    for (const table of ["website_document_publications", "website_hosted_tenant_reservations"]) {
      expect(tenantTables).toContain(table);
      expect(swept).not.toContain(`"${table}"`);
      expect(deprovisionLib).toMatch(new RegExp(`WORKSPACE_OWNED_TENANT_TABLES = \\[[^\\]]*"${table}"`));
    }
  });
});
