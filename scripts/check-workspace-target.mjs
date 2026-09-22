#!/usr/bin/env node
/**
 * Compare a read-only catalog snapshot with the candidate's migration filenames
 * and a separately retrieved deployment-to-Supabase mapping. No network calls,
 * environment reads, secrets, SQL execution, migrations or provider mutations.
 *
 * This is a metadata consistency check, not authorization or release acceptance.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REQUIRED_WORKSPACE_RELATIONS = Object.freeze([
  "workspaces", "workspace_memberships", "saved_product_work",
  "application_states", "application_releases", "application_records",
  "workspace_calendar_connections", "workspace_exit_requests", "job_economics",
  "work_allowances", "offering_website_bindings", "inquiry_workspaces",
]);
const MAX_BYTES = 2_000_000;
const HOUR = 3_600_000;
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const timestamp = value => typeof value === "string" ? Date.parse(value) : NaN;
const text = value => typeof value === "string" && value.length > 0;

export function compareWorkspaceTarget(catalog, deployment, migrations, options) {
  const issues = [];
  const now = options?.now ?? Date.now();
  const expectedProjectRef = options?.expectedProjectRef;
  const expectedSourceSha = options?.expectedSourceSha;
  const missingRelations = [];
  const pendingMigrations = [];
  const unknownMigrations = [];
  const changedNames = [];
  const add = code => { if (!issues.includes(code)) issues.push(code); };
  if (!/^[a-z0-9]{20}$/.test(expectedProjectRef ?? "")) add("expected_project_ref_required");
  if (!/^[a-f0-9]{40}$/.test(expectedSourceSha ?? "")) add("expected_source_sha_required");
  if (!Number.isFinite(now)) add("invalid_check_time");
  const fresh = (value, prefix) => {
    const t = timestamp(value);
    if (!Number.isFinite(t)) add(`${prefix}_timestamp_invalid`);
    else if (t > now + 120_000) add(`${prefix}_timestamp_in_future`);
    else if (now - t > HOUR) add(`${prefix}_snapshot_stale`);
  };
  if (!record(deployment)) add("deployment_mapping_required");
  else {
    fresh(deployment.observedAt, "deployment");
    if (!text(deployment.deploymentId)) add("deployment_identity_required");
    if (deployment.sourceSha !== expectedSourceSha) add("deployment_source_mismatch");
    // The exported mapping must include both the catalog source and the app's
    // canonical Supabase origin. Do not infer this from a friendly project name.
    if (deployment.catalogProjectRef !== expectedProjectRef) add("catalog_target_mismatch");
    try {
      const origin = new URL(deployment.supabaseOrigin);
      if (origin.protocol !== "https:" || origin.username || origin.password || origin.search || origin.hash ||
          origin.port || origin.pathname !== "/" || origin.hostname !== `${expectedProjectRef}.supabase.co`) {
        add("application_target_mismatch");
      }
    } catch { add("application_target_mismatch"); }
  }
  const expected = new Map();
  if (!Array.isArray(migrations) || migrations.length === 0) add("candidate_migration_inventory_required");
  else for (const item of migrations) {
    if (!record(item) || !/^\d{14}$/.test(item.version ?? "") || !text(item.name)) {
      add("candidate_migration_inventory_invalid"); continue;
    }
    if (expected.has(item.version)) add("candidate_migration_version_duplicate");
    expected.set(item.version, item.name);
  }
  if (!record(catalog) || catalog.version !== 1) add("catalog_snapshot_invalid");
  else {
    fresh(catalog.observedAt, "catalog");
    if (!Array.isArray(catalog.relations)) add("catalog_relations_invalid");
    else {
      const relations = new Map();
      for (const item of catalog.relations) {
        if (!record(item) || !text(item.name) || !text(item.kind) || typeof item.rlsEnabled !== "boolean") {
          add("catalog_relations_invalid"); continue;
        }
        if (relations.has(item.name)) add("catalog_relation_duplicate");
        relations.set(item.name, item);
      }
      for (const name of REQUIRED_WORKSPACE_RELATIONS) {
        const relation = relations.get(name);
        if (!relation || !["r", "p"].includes(relation.kind)) missingRelations.push(name);
        else if (!relation.rlsEnabled) add("workspace_rls_not_enabled");
      }
      if (missingRelations.length) add("workspace_relations_missing");
    }
    if (!Array.isArray(catalog.migrations)) add("catalog_migrations_invalid");
    else {
      const actual = new Map();
      for (const item of catalog.migrations) {
        if (!record(item) || !/^\d{14}$/.test(item.version ?? "") || !text(item.name)) {
          add("catalog_migrations_invalid"); continue;
        }
        if (actual.has(item.version)) add("catalog_migration_version_duplicate");
        actual.set(item.version, item.name);
        if (!expected.has(item.version)) unknownMigrations.push(item.version);
        else if (expected.get(item.version) !== item.name) changedNames.push(item.version);
      }
      for (const version of expected.keys()) if (!actual.has(version)) pendingMigrations.push(version);
      if (pendingMigrations.length) add("candidate_migrations_unapplied");
      if (unknownMigrations.length) add("catalog_migrations_unrecognized");
      if (changedNames.length) add("migration_names_differ");
    }
  }
  return {
    status: issues.length ? "blocked" : "metadata_consistent",
    issues,
    missingRelations,
    pendingMigrations: pendingMigrations.sort(),
    unknownMigrations: unknownMigrations.sort(),
    changedNames: changedNames.sort(),
    releaseApproved: false,
    limitations: [
      "Supplied deployment mapping must be verified independently; this checker does not authenticate its provenance.",
      "Matching migration names and tables do not prove SQL definitions, RPC privileges, data migration or runtime behavior.",
      "Run the existing ordered upgrade, native authorization and ordinary-account journey checks. No live action is authorized by this result.",
    ],
  };
}

export function readCandidateMigrations(directory) {
  // These retained manual helpers are not forward migrations. Keep the list
  // explicit so an accidentally misnamed new migration still fails closed.
  const helpers = new Set([
    "rollback-identity-spine-expand.sql",
    "rollback-org-layer-phase0.sql",
    "verify-identity-spine-expand.sql",
  ]);
  return readdirSync(directory).filter(name => name.endsWith(".sql") && !helpers.has(name)).sort().map(name => {
    const match = /^(\d{14})_(.+)\.sql$/.exec(name);
    if (!match) throw new Error("Candidate contains a non-versioned SQL migration filename.");
    return { version: match[1], name: match[2] };
  });
}

function jsonFile(path) {
  const bytes = readFileSync(path);
  if (bytes.length > MAX_BYTES) throw new Error("Snapshot exceeds the metadata size limit.");
  return JSON.parse(bytes.toString("utf8"));
}

export function main(argv) {
  const allowed = new Set(["--catalog", "--deployment", "--expected-project-ref", "--expected-source-sha"]);
  const args = new Map();
  for (let i = 0; i < argv.length; i += 2) {
    if (!allowed.has(argv[i]) || args.has(argv[i]) || !argv[i + 1] || argv[i + 1].startsWith("--")) {
      throw new Error("Supply each required flag exactly once with a value.");
    }
    args.set(argv[i], argv[i + 1]);
  }
  if (args.size !== allowed.size) throw new Error("Required: --catalog FILE --deployment FILE --expected-project-ref REF --expected-source-sha SHA");
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const result = compareWorkspaceTarget(
    jsonFile(args.get("--catalog")),
    jsonFile(args.get("--deployment")),
    readCandidateMigrations(resolve(root, "supabase/migrations")),
    { expectedProjectRef: args.get("--expected-project-ref"), expectedSourceSha: args.get("--expected-source-sha") },
  );
  console.log(JSON.stringify(result, null, 2));
  return result.status === "metadata_consistent" ? 0 : 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch { console.error("Workspace target check could not run. Verify the flags, metadata JSON and candidate migration directory. No changes were made."); process.exitCode = 2; }
}
