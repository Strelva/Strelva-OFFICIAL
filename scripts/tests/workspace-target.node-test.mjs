import { test } from "node:test";
import assert from "node:assert/strict";
import { compareWorkspaceTarget, REQUIRED_WORKSPACE_RELATIONS } from "../check-workspace-target.mjs";
const now = Date.parse("2026-09-21T12:00:00Z");
const project = "zthifbnrtsirdekzzlxs";
const sha = "6490eb9906150dc27dd7a7abfadc3fe8d68b6c73";
function input() {
  const migrations = [{ version: "20260920120000", name: "websites" }, { version: "20260920121000", name: "agency_managed_website_draft_authority" }];
  return {
    catalog: { version: 1, observedAt: new Date(now).toISOString(), relations: REQUIRED_WORKSPACE_RELATIONS.map(name=>({name,kind:"r",rlsEnabled:true})), migrations: structuredClone(migrations) },
    deployment: { deploymentId:"synthetic-deployment", observedAt:new Date(now).toISOString(), sourceSha:sha, supabaseOrigin:`https://${project}.supabase.co`, catalogProjectRef:project },
    migrations, options:{now,expectedProjectRef:project,expectedSourceSha:sha},
  };
}
function run(v) { return compareWorkspaceTarget(v.catalog,v.deployment,v.migrations,v.options); }
test("matching metadata never becomes release approval",()=>{const r=run(input());assert.equal(r.status,"metadata_consistent");assert.equal(r.releaseApproved,false);assert.equal(r.issues.length,0);});
for (const [name,mutate,code] of [
  ["missing tables", v=>v.catalog.relations=[], "workspace_relations_missing"],
  ["view replacing a table", v=>v.catalog.relations[0].kind="v", "workspace_relations_missing"],
  ["disabled RLS", v=>v.catalog.relations[0].rlsEnabled=false, "workspace_rls_not_enabled"],
  ["missing earlier migration despite matching latest", v=>v.catalog.migrations.shift(), "candidate_migrations_unapplied"],
  ["unknown applied migration", v=>v.catalog.migrations.push({version:"20260922000000",name:"external"}), "catalog_migrations_unrecognized"],
  ["same version with a different name", v=>v.catalog.migrations[0].name="different", "migration_names_differ"],
  ["duplicate catalog versions", v=>v.catalog.migrations.push(v.catalog.migrations[0]), "catalog_migration_version_duplicate"],
  ["duplicate candidate versions", v=>v.migrations.push(v.migrations[0]), "candidate_migration_version_duplicate"],
  ["missing candidate history", v=>v.migrations=[], "candidate_migration_inventory_required"],
  ["wrong app database", v=>v.deployment.supabaseOrigin="https://aaaaaaaaaaaaaaaaaaaa.supabase.co", "application_target_mismatch"],
  ["wrong catalog database", v=>v.deployment.catalogProjectRef="aaaaaaaaaaaaaaaaaaaa", "catalog_target_mismatch"],
  ["wrong source commit", v=>v.deployment.sourceSha="f".repeat(40), "deployment_source_mismatch"],
  ["missing deployment evidence", v=>v.deployment=null, "deployment_mapping_required"],
  ["missing expected project", v=>delete v.options.expectedProjectRef, "expected_project_ref_required"],
  ["stale catalog", v=>v.catalog.observedAt="2026-09-21T05:12:46Z", "catalog_snapshot_stale"],
  ["stale deployment", v=>v.deployment.observedAt="2026-09-21T05:12:46Z", "deployment_snapshot_stale"],
  ["future catalog", v=>v.catalog.observedAt="2026-09-22T12:00:00Z", "catalog_timestamp_in_future"],
  ["malformed timestamp", v=>v.catalog.observedAt="unknown", "catalog_timestamp_invalid"],
  ["credentials in origin", v=>v.deployment.supabaseOrigin=`https://secret:password@${project}.supabase.co`, "application_target_mismatch"],
  ["invalid origin", v=>v.deployment.supabaseOrigin="not a URL", "application_target_mismatch"],
  ["invalid history shape", v=>v.catalog.migrations=null, "catalog_migrations_invalid"],
  ["duplicate relation rows", v=>v.catalog.relations.push(v.catalog.relations[0]), "catalog_relation_duplicate"],
]) {
  test(`fails closed for ${name}`,()=>{const v=input();mutate(v);const r=run(v);assert.equal(r.status,"blocked");assert.ok(r.issues.includes(code),JSON.stringify(r));assert.equal(r.releaseApproved,false);});
}
test("returns exact missing relations and earlier migration versions",()=>{const v=input();v.catalog.relations=[];v.catalog.migrations.shift();const r=run(v);assert.deepEqual(r.missingRelations,REQUIRED_WORKSPACE_RELATIONS);assert.deepEqual(r.pendingMigrations,["20260920120000"]);});
test("does not disclose provided secrets in its report",()=>{const v=input();v.deployment.supabaseOrigin=`https://secret:password@${project}.supabase.co`;const r=JSON.stringify(run(v));assert.ok(!r.includes("password"));assert.ok(!r.includes("secret:"));});
