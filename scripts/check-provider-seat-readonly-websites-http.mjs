#!/usr/bin/env node
// Local PostgREST proof only. Reuses an already-running disposable stack;
// never starts Docker, a browser or an application server. Seed once per DB.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import * as postgresModule from "./release-safety/postgres.ts";
const { isLocalUrl, pgEnv } = postgresModule.default ?? postgresModule;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const databaseUrl = process.env.STRELVA_LOCAL_DB_URL;
const apiUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const restUrl = process.env.STRELVA_LOCAL_REST_URL || (apiUrl && `${apiUrl}/rest/v1`);
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (process.env.STRELVA_LOCAL_AUTH_PROOF !== "1" || !isLocalUrl(databaseUrl || "") || !restUrl || !serviceKey || !anonKey) {
  throw Error("Explicit disposable local Auth/REST/database configuration is required.");
}
function requireLocalHttp(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password || url.search || url.hash) throw Error("Loopback HTTP endpoint required.");
}
requireLocalHttp(restUrl);
if (apiUrl) requireLocalHttp(apiUrl);
function sql(statement) {
  try {
    return execFileSync("psql", [databaseUrl, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"], {
      env: pgEnv(), input: statement, encoding: "utf8", timeout: 60_000, maxBuffer: 8 * 1024 * 1024,
    }).trim();
  } catch {
    // Do not propagate command arguments (database URLs can contain passwords).
    throw Error("Local SQL fixture or assertion failed; inspect the disposable database.");
  }
}
if (process.argv.length !== 2) throw Error("No arguments supported; reuse the explicit disposable stack environment.");
const actor = "5e181300-0000-4000-8000-000000000003";
const workspace = "5e181300-0000-4000-8000-000000000010";
const agency = "5e181300-0000-4000-8000-000000000020";
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
if (sql(`select exists(select 1 from public.users where id=${quote(actor)});`) !== "t") {
  const fixture = readFileSync(resolve(root, "tests/support/provider-seat-readonly-website-fixture.sql"), "utf8");
  sql(`\\o /dev/null\nbegin;\n${fixture}\ncommit;`);
}
// Restore the fictional provider if the SQL revocation proof already used it.
sql(`select public.choose_business_provider('5e181300-0000-4000-8000-000000000001','pw-owner@example.test',${quote(workspace)},${quote(agency)});
select public.set_agency_client_staff('5e181300-0000-4000-8000-000000000002','pw-agency@example.test',${quote(agency)},${quote(workspace)},${quote(actor)},true);`);
const workId = sql(`select id from public.saved_product_work where workspace_id=${quote(workspace)} and product_id='websites' and payload->>'title'='Owner website' order by created_at limit 1;`);
assert.match(workId, /^[a-f0-9-]{36}$/);
assert.equal(sql(`select count(*) from public.workspace_memberships where workspace_id=${quote(workspace)} and user_id=${quote(actor)};`), "0");
const parameters = { p_workspace_id: workspace, p_work_id: workId, p_user_id: actor, p_verified_email: "pw-staff@example.test" };
const readers = ["read_website_current_tenant", "read_website_linked_publications", "read_website_domain_approvals"];
async function rpc(name, method, args, token = serviceKey, key = serviceKey) {
  const endpoint = new URL(`${restUrl.replace(/\/$/, "")}/rpc/${name}`);
  if (method === "GET") for (const [name, value] of Object.entries(args)) endpoint.searchParams.set(name, String(value));
  const response = await fetch(endpoint, { method, headers: { apikey: key, authorization: `Bearer ${token}`, "content-type": "application/json" }, body: method === "POST" ? JSON.stringify(args) : undefined, signal: AbortSignal.timeout(15_000) });
  return { status: response.status, body: await response.json() };
}
let positives = 0, denials = 0;
async function expectDenied(args) {
  for (const name of readers) for (const method of ["GET", "POST"]) {
    const response = await rpc(name, method, args);
    assert.equal(response.body.code, "P0001");
    assert.equal(response.body.message, "workspace_access_denied");
    assert.ok(response.status >= 400);
    denials++;
  }
}
for (const name of readers) {
  const expected = JSON.parse(sql(`select jsonb_agg(to_jsonb(r)) from public.${name}(${Object.values(parameters).map(quote).join(",")}) r;`));
  assert.equal(expected.length, 1, "meaningful seeded authorized record");
  for (const method of ["GET", "POST"]) {
    const response = await rpc(name, method, parameters);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, expected);
    positives++;
  }
}
for (const [id, email] of [["000000000004", "pw-unstaffed@example.test"], ["000000000005", "pw-other@example.test"], ["000000000006", "pw-unverified@example.test"]]) {
  await expectDenied({ ...parameters, p_user_id: `5e181300-0000-4000-8000-${id}`, p_verified_email: email });
}
await expectDenied({ ...parameters, p_verified_email: "wrong@example.test" });
const foreignWorkId = sql("select id from public.saved_product_work where workspace_id='5e181300-0000-4000-8000-000000000040' and product_id='websites' order by created_at limit 1;");
assert.match(foreignWorkId, /^[a-f0-9-]{36}$/);
await expectDenied({ ...parameters, p_work_id: foreignWorkId });
try {
  sql(`select public.set_agency_client_staff('5e181300-0000-4000-8000-000000000002','pw-agency@example.test',${quote(agency)},${quote(workspace)},${quote(actor)},false);`);
  await expectDenied(parameters);
} finally {
  sql(`select public.set_agency_client_staff('5e181300-0000-4000-8000-000000000002','pw-agency@example.test',${quote(agency)},${quote(workspace)},${quote(actor)},true);`);
}
let browserToken = process.env.STRELVA_LOCAL_AUTHENTICATED_JWT;
if (!browserToken) {
  if (!apiUrl) throw Error("Local Auth API or explicit local authenticated JWT required.");
  const response = await fetch(`${apiUrl}/auth/v1/signup`, {
    method: "POST", headers: { apikey: anonKey, authorization: `Bearer ${anonKey}`, "content-type": "application/json" },
    body: JSON.stringify({ email: `provider-reader-${randomBytes(6).toString("hex")}@example.test`, password: randomBytes(24).toString("base64url") }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json();
  if (!response.ok || !body.access_token) throw Error("Disposable Auth did not issue browser session.");
  browserToken = body.access_token;
}
for (const token of [anonKey, browserToken]) for (const method of ["GET", "POST"]) {
  const denied = await rpc("website_document_read_actor", method, { ...parameters, p_manage: false, p_write: false }, token, anonKey);
  assert.equal(denied.body.code, "42501");
  assert.ok(denied.status >= 400);
}
console.log(`Provider website actual PostgREST proof: ${positives} authorized GET/POST results equal SQL; ${denials} identity/scope/revoked-staff denials; 4 anonymous/authenticated private-helper denials.`);
