import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkMigrationOrder, validMigrationTimestamp } from "../check-migration-order.mjs";
import { readCandidateMigrations } from "../check-workspace-target.mjs";

const old = { version: "20261024800001", name: "provider_health_alerts" };
const baseline = { ceiling: old.version, migrations: [old] };

test("preserves historical ordered identifiers while admitting valid later additions", () => {
  assert.deepEqual(checkMigrationOrder([old, { version: "20261025100000", name: "done_gate_example" }], baseline), []);
});
test("refuses backdated, malformed, duplicated, renamed and deleted migrations", () => {
  assert.match(checkMigrationOrder([old, { version: "20261014100000", name: "new" }], baseline).join(), /must sort after/);
  assert.match(checkMigrationOrder([old, { version: "20261025800000", name: "new" }], baseline).join(), /valid UTC/);
  assert.match(checkMigrationOrder([old, old], baseline).join(), /Duplicate/);
  assert.match(checkMigrationOrder([{ ...old, name: "renamed" }], baseline).join(), /renamed/);
  assert.match(checkMigrationOrder([], baseline).join(), /missing/);
});
test("calendar validation rejects overflow and handles leap dates", () => {
  for (const version of ["20261301100000", "20260229100000", "20260431100000", "20261025246000", "20261025106000", "20261025100060", "20261025"]) assert.equal(validMigrationTimestamp(version), false, version);
  for (const version of ["20261025100000", "20280229100000"]) assert.equal(validMigrationTimestamp(version), true, version);
});
test("current repository preserves the exact retained forward inventory", () => {
  const recorded = JSON.parse(readFileSync(new URL("../migration-order-baseline.json", import.meta.url), "utf8"));
  assert.equal(recorded.ceiling, "20261024800001");
  assert.deepEqual(checkMigrationOrder(readCandidateMigrations(new URL("../../supabase/migrations/", import.meta.url)), recorded), []);
});
