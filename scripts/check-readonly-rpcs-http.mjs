#!/usr/bin/env node
// Local PostgREST proof only. Reuses an already-running disposable stack;
// never starts Docker, a browser or an application server. Seed once per DB.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
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
const args = process.argv.slice(2);
if (args.some((argument) => argument !== "--reuse-fixture") || args.length > 1) throw Error("Only --reuse-fixture is supported.");
const reuseFixture = args.includes("--reuse-fixture");
const fixture = readFileSync(resolve(root, "tests/support/readonly-reader-fixture.sql"), "utf8");
const caseSql = readFileSync(resolve(root, "tests/support/readonly-reader-cases.sql"), "utf8");
// Resolve psql's relative fixture includes before sending input over stdin.
const fixtureSql = fixture.replace(/\\ir confirm-working-record.sql/, `\\ir ${resolve(root, "tests/support/confirm-working-record.sql")}`);
const reuseSql = `select l.workspace_id as reader_workspace_id from public.tenant_workspace_links l where l.tenant_stable_id='1323ffff-0000-4000-8000-000000000010' \\gset
select id as reader_lead_id from public.tenant_leads where tenant_stable_id='1323ffff-0000-4000-8000-000000000010' and lead_id='lead_handoff' \\gset
select id as reader_offer_id from public.inquiry_booking_offers where lead_row_id=:'reader_lead_id' order by created_at limit 1 \\gset
select id as reader_version_id from public.system_versions where business_workspace_id='13230000-0000-4000-8000-000000000011' order by created_at limit 1 \\gset
select id as reader_website_work_id from public.saved_product_work where workspace_id=:'reader_workspace_id' and product_id='websites' and payload->>'title'='Reader website' \\gset
`;
const cases = JSON.parse(sql(`\\o /dev/null\nbegin;\n${reuseFixture ? reuseSql : fixtureSql}\n${caseSql}\ncommit;\n\\o\nselect json_agg(to_jsonb(c) || jsonb_build_object('returnsSet',p.proretset)) from readonly_reader_cases c join pg_proc p on p.pronamespace='public'::regnamespace and p.proname=c.rpc_name and array(select jsonb_object_keys(c.parameters)) <@ p.proargnames;`));
assert.equal(cases.length, 26, "all local reader cases seeded exactly once");
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
function parameterText(value) {
  if (Array.isArray(value)) return `{${value.map((item) => `"${String(item).replaceAll('"', '\\"')}"`).join(",")}}`;
  if (value !== null && typeof value === "object") return JSON.stringify(value);
  return String(value);
}
function getParameters(parameters) {
  return Object.fromEntries(Object.entries(parameters).flatMap(([name, value]) => {
    if (value !== null) return [[name, value]];
    // GET has no JSON null; supply equivalent concrete read controls or the
    // function's declared default. Actual GET results are compared with SQL
    // executed with these same arguments, not assumed equivalent.
    if (name === "p_cursor") return [];
    if (name === "p_states") return [[name, ["kept", "released"]]];
    if (name === "p_before") return [[name, new Date(Date.now() + 86_400_000).toISOString()]];
    if (name === "p_before_id") return [[name, "ffffffff-ffff-4fff-8fff-ffffffffffff"]];
    if (name === "p_tenant_id") return [[name, "readonly-reader-site"]];
    throw Error(`GET argument needs an explicit local read value: ${name}`);
  }));
}
function expectedResult(testCase, parameters) {
  const args = Object.entries(parameters).map(([name, value]) => `${name} => ${value === null ? "null" : quote(parameterText(value))}`).join(",");
  const call = `public.${testCase.rpc_name}(${args})`;
  const query = testCase.returnsSet ? `select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from ${call} r;` : `select coalesce(to_jsonb(${call}),'null'::jsonb);`;
  return JSON.parse(sql(query));
}
async function rpc(testCase, method, parameters, token = serviceKey, key = serviceKey) {
  const endpoint = new URL(`${restUrl.replace(/\/$/, "")}/rpc/${testCase.rpc_name}`);
  if (method === "GET") for (const [name, value] of Object.entries(parameters)) endpoint.searchParams.set(name, parameterText(value));
  const response = await fetch(endpoint, {
    method, headers: { apikey: key, authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: method === "POST" ? JSON.stringify(parameters) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json();
  return { status: response.status, body };
}
let positive = 0, denials = 0;
for (const testCase of cases.filter((item) => item.exposed)) {
  assert.equal(sql(`${testCase.statement};`), "t", `${testCase.rpc_name}: meaningful local authorized result`);
  for (const method of ["POST", "GET"]) {
    const parameters = method === "GET" ? getParameters(testCase.parameters) : testCase.parameters;
    const expected = expectedResult(testCase, parameters);
    const result = await rpc(testCase, method, parameters);
    assert.equal(result.status, 200, `${testCase.rpc_name} ${method}: status/code ${result.status}/${result.body?.code}`);
    assert.deepEqual(result.body, expected, `${testCase.rpc_name} ${method}: HTTP result matches real SQL`);
    positive++;
    if (testCase.denial) {
      const denied = { ...parameters, p_user_id: "13230000-0000-4000-8000-000000000003", p_verified_email: "readonly-outsider@example.test" };
      const result = await rpc(testCase, method, denied);
      assert.ok(result.status >= 400, `${testCase.rpc_name} ${method}: outsider was admitted`);
      assert.equal(result.body.code, "P0001", `${testCase.rpc_name} ${method}: authority denial code`);
      assert.equal(result.body.message, testCase.denial, `${testCase.rpc_name} ${method}: authority denial message`);
      denials++;
    }
  }
}
let browserToken = process.env.STRELVA_LOCAL_AUTHENTICATED_JWT;
if (!browserToken) {
  if (!apiUrl) throw Error("Local Auth API or an explicitly supplied local authenticated JWT is required.");
  const response = await fetch(`${apiUrl}/auth/v1/signup`, {
    method: "POST", headers: { apikey: anonKey, authorization: `Bearer ${anonKey}`, "content-type": "application/json" },
    body: JSON.stringify({ email: `readonly-browser-${randomBytes(6).toString("hex")}@example.test`, password: randomBytes(24).toString("base64url") }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json();
  if (!response.ok || !body.access_token) throw Error("Disposable Auth did not issue a signed-in browser session.");
  browserToken = body.access_token;
}
const privateHelper = cases.find((item) => !item.exposed);
for (const [role, token] of [["anon", anonKey], ["authenticated", browserToken]]) {
  for (const method of ["POST", "GET"]) {
    const parameters = method === "GET" ? getParameters(privateHelper.parameters) : privateHelper.parameters;
    const result = await rpc(privateHelper, method, parameters, token, anonKey);
    assert.ok([401, 403].includes(result.status), `${role} ${method}: private helper was exposed`);
    assert.equal(result.body.code, "42501", `${role} ${method}: private helper privilege denial`);
  }
}
console.log(`Actual PostgREST proof: ${positive} authorized GET/POST results match SQL; ${denials} outsider denials; anon/authenticated private-helper GET/POST denied. GET requests exercised enforced READ ONLY transactions.`);
