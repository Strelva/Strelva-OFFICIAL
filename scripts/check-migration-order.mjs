#!/usr/bin/env node
// Migration versions are ordered identifiers. Never rename retained versions to
// repair their historical calendar dates: a deployed catalog may already own them.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readCandidateMigrations } from "./check-workspace-target.mjs";

export function validMigrationTimestamp(version) {
  if (!/^\d{14}$/.test(version)) return false;
  const iso = `${version.slice(0, 4)}-${version.slice(4, 6)}-${version.slice(6, 8)}T${version.slice(8, 10)}:${version.slice(10, 12)}:${version.slice(12, 14)}.000Z`;
  const instant = new Date(iso);
  return Number.isFinite(instant.getTime()) && instant.toISOString() === iso;
}

export function checkMigrationOrder(migrations, baseline) {
  const retained = new Map(baseline.migrations.map(item => [item.version, item.name]));
  const current = new Map();
  const errors = [];
  for (const { version, name } of migrations) {
    if (current.has(version)) errors.push(`Duplicate migration version ${version}.`);
    current.set(version, name);
    if (retained.has(version)) {
      if (retained.get(version) !== name) errors.push(`Retained migration ${version} was renamed.`);
      continue;
    }
    if (version <= baseline.ceiling) errors.push(`New migration ${version} must sort after ${baseline.ceiling}.`);
    if (!validMigrationTimestamp(version)) errors.push(`New migration ${version} must use a valid UTC calendar timestamp.`);
  }
  for (const version of retained.keys()) {
    if (!current.has(version)) errors.push(`Retained migration ${version} is missing.`);
  }
  return errors;
}

export function main() {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const baseline = JSON.parse(readFileSync(new URL("./migration-order-baseline.json", import.meta.url), "utf8"));
  const migrations = readCandidateMigrations(resolve(root, "supabase/migrations"));
  const errors = checkMigrationOrder(migrations, baseline);
  if (errors.length) {
    console.error(errors.join("\n"));
    return 1;
  }
  console.log(`Migration order: ${migrations.length} forwards; retained inventory preserved; additions sort after ${baseline.ceiling} with valid UTC versions. No SQL executed.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.exitCode = main(); }
  catch (error) { console.error(error instanceof Error ? error.message : "Migration inventory could not be checked."); process.exitCode = 1; }
}
