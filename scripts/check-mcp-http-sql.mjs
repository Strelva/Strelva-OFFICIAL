#!/usr/bin/env node
/**
 * Real Next HTTP routes -> Supabase JS -> local RPC adapter -> real Postgres.
 * Run only through STRELVA_MCP_HTTP_SQL_PROOF=1 check-agent-channel-sql.sh.
 * No hosted credentials, public listeners, external effects or new packages.
 * Fixture-issued consent proves neither Supabase sign-in nor native clients.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const runFile = promisify(execFile);
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const owner = "ae181400-0000-4000-8000-000000000001";
const business = "ae181400-0000-4000-8000-000000000010";
const otherBusiness = "ae181400-0000-4000-8000-000000000020";
const website = "ae181400-0000-4000-8000-000000000030";
const ownerEmail = "mcp-http-owner@example.test";
const clientId = "https://fictional-assistant.example.test/client.json";
const callback = "http://127.0.0.1:41239/callback";
const digest = value => createHash("sha256").update(value).digest("hex");
const check = (ok, label) => { if (!ok) throw new Error(label); };

check(process.env.STRELVA_MCP_HTTP_SQL_PROOF === "1", "Use the disposable SQL runner with STRELVA_MCP_HTTP_SQL_PROOF=1.");
check(/^\/(?:private\/)?tmp\/strelva-agent-channel-socket\.[A-Za-z0-9]+$/.test(process.env.PGHOST || "")
  && /^\d+$/.test(process.env.PGPORT || "") && process.env.PGDATABASE === "postgres", "Only the runner-owned local Unix-socket cluster is allowed.");
for (const name of [".env", ".env.local", ".env.development", ".env.development.local"]) {
  let exists = false;
  try { await access(join(repo, name)); exists = true; } catch (cause) { if (cause.code !== "ENOENT") throw cause; }
  check(!exists, "Run the HTTP proof from a prepared checkout without environment files; Next must not load hosted credentials.");
}

// Do not inherit provider credentials or real service configuration into Next.
const cleanEnv = Object.fromEntries(["PATH", "HOME", "TMPDIR", "USER", "LOGNAME"].flatMap(key => process.env[key] ? [[key, process.env[key]]] : []));
const pgEnv = { ...cleanEnv, LC_ALL: "C", PGHOST: process.env.PGHOST, PGPORT: process.env.PGPORT,
  PGUSER: process.env.PGUSER, PGDATABASE: "postgres" };
const artifacts = await mkdtemp(join(tmpdir(), "strelva-mcp-http-proof-"));
const distDir = `.next-mcp-http-sql-${process.pid}`;
let next;
let rpcServer;
let logStream;
let sequence = 1;
const rpcCalls = new Map();
const generatedBefore = new Map();

// Names and argument types are fixed. Values are UTF-8/base64 data, never SQL.
const identity = { p_token_hash: "text", p_resource: "text", p_workspace_id: "uuid" };
const routines = {
  exchange_agent_oauth_connection_code: { p_code_hash: "text", p_client_id: "text", p_redirect_uri: "text", p_resource: "text", p_challenge: "text", p_token_hash: "text", p_refresh_hash: "text" },
  refresh_agent_oauth_connection: { p_refresh_hash: "text", p_client_id: "text", p_resource: "text", p_scopes: "text[]", p_token_hash: "text", p_next_refresh_hash: "text" },
  read_agent_oauth_connection: { p_token_hash: "text", p_resource: "text" },
  read_agent_oauth_principal: identity,
  validate_agent_oauth_token: { ...identity, p_scope: "text" },
  call_agent_protected_tool: { ...identity, p_tool: "text", p_args: "jsonb" },
  list_agent_websites: identity,
  read_agent_website_work: { ...identity, p_work_id: "uuid", p_scope: "text" },
  read_agent_website_proposal_retry: { ...identity, p_request_id: "uuid", p_request_hash: "text" },
  list_agent_website_proposals: { ...identity, p_work_id: "uuid" },
  commit_agent_website_candidate: { ...identity, p_work_id: "uuid", p_request_id: "uuid", p_request_hash: "text", p_summary: "text",
    p_expected_work_revision: "integer", p_expected_document_revision: "integer", p_expected_candidate_hash: "text", p_content_hash: "text", p_document: "jsonb", p_payload: "jsonb" },
  revoke_agent_oauth_client_token: { p_token_hash: "text", p_client_id: "text" },
};
const fixtureRoutines = {
  issue_agent_oauth_connection_code: { p_user_id: "uuid", p_verified_email: "text", p_workspace_id: "uuid", p_agency_id: "uuid", p_code_hash: "text",
    p_client_id: "text", p_client_name: "text", p_redirect_uri: "text", p_resource: "text", p_challenge: "text", p_scopes: "text[]" },
  list_agent_oauth_connections: { p_user_id: "uuid", p_verified_email: "text", p_workspace_id: "uuid" },
  disconnect_agent_oauth_connection: { p_user_id: "uuid", p_verified_email: "text", p_workspace_id: "uuid", p_connection_id: "uuid" },
};
function sqlValue(value, type) {
  if (value === null) return `null::${type}`;
  if (type === "integer") { check(Number.isSafeInteger(value), "RPC integer argument is invalid."); return `${value}::integer`; }
  if (type === "text[]") {
    check(Array.isArray(value) && value.every(item => typeof item === "string"), "RPC text-array argument is invalid.");
    return `array[${value.map(item => sqlValue(item, "text")).join(",")}]::text[]`;
  }
  check(type === "jsonb" || typeof value === "string", "RPC string argument is invalid.");
  const encoded = Buffer.from(type === "jsonb" ? JSON.stringify(value) : value, "utf8").toString("base64");
  return `convert_from(decode('${encoded}','base64'),'UTF8')::${type}`;
}
// Pipe stdin rather than putting generated statements or synthetic tokens in argv.
async function psql(statement, env = pgEnv) {
  const child = spawn("psql", ["--no-psqlrc", "--set=ON_ERROR_STOP=1", "--quiet", "--tuples-only", "--no-align"], { cwd: repo, env, stdio: ["pipe", "pipe", "pipe"] });
  let output = "", error = "";
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { error += chunk; });
  child.stdin.end(statement);
  const [code] = await once(child, "close");
  if (code !== 0) {
    const semantic = /ERROR:\s*([^\r\n]+)/.exec(error)?.[1];
    throw new Error(semantic || "Local PostgreSQL operation failed.");
  }
  return output.trim();
}
async function rpc(name, args, fixture = false) {
  const spec = (fixture ? fixtureRoutines : routines)[name];
  check(spec && Object.keys(args).length === Object.keys(spec).length && Object.keys(spec).every(key => Object.hasOwn(args, key)), "RPC is outside the local proof allowlist.");
  const values = Object.entries(spec).map(([key, type]) => `${key} => ${sqlValue(args[key], type)}`).join(",");
  return JSON.parse(await psql(`begin; set local role service_role; select coalesce(to_jsonb(public.${name}(${values})),'null'::jsonb); commit;`));
}
async function localPort() {
  const probe = createNetServer();
  await new Promise((resolveReady, reject) => { probe.once("error", reject); probe.listen(0, "127.0.0.1", resolveReady); });
  const port = probe.address().port;
  await new Promise(resolveClosed => probe.close(resolveClosed));
  return port;
}
async function seedFixture() {
  // Reuse production parsers and hash implementation for a valid native candidate.
  const code = `
    import { siteDocumentSchema, siteDocumentHash } from './src/products/websites/site-document.ts';
    import { websiteRebuildSchema } from './src/products/websites/rebuild-contracts.ts';
    const document = siteDocumentSchema.parse({ version: 2, siteName: 'Fictional HTTP website', theme: { palette: 'light', typeScale: 'standard' },
      pages: [{ path: '/', title: 'Fictional business', description: '', root: 'hero' }],
      nodes: { hero: { id: 'hero', type: 'Hero', variant: 'statement', props: { title: 'Original headline', body: 'Original body' }, children: [], factIds: [] } },
      facts: {}, assets: {}, redirects: [], provenance: { composer: 'rules', sourceUrl: 'https://private-source.example.test/fixture' } });
    const hash = siteDocumentHash(document);
    const payload = websiteRebuildSchema.parse({ version: 2, revision: 0, title: 'Fictional HTTP website', input: { requestId: 'http-proof-fixture', description: 'Disposable fictional business', businessName: 'Fictional HTTP business' },
      status: 'approved', stages: [], checkpoint: { fixtureOnly: 'private-checkpoint-fixture' }, lastError: null,
      candidate: { revision: 1, contentHash: hash, document, previewHref: '/api/websites/${website}/preview' }, approvedCandidateRevision: 1,
      tenantId: null, launch: { receipt: null, readBack: null }, createdBy: '${owner}', createdAt: '2026-10-08T12:00:00Z', history: [] });
    process.stdout.write(JSON.stringify({ document, payload, hash }));
  `;
  const { stdout } = await runFile(process.execPath, [join(repo, "node_modules/tsx/dist/cli.mjs"), "-e", code], { cwd: repo, env: cleanEnv });
  const fixture = JSON.parse(stdout);
  const env = { ...pgEnv, STRELVA_HTTP_FIXTURE_DOCUMENT: JSON.stringify(fixture.document), STRELVA_HTTP_FIXTURE_PAYLOAD: JSON.stringify(fixture.payload), STRELVA_HTTP_FIXTURE_HASH: fixture.hash };
  await psql(await readFile(join(repo, "tests/agent-mcp-http-fixture.sql"), "utf8"), env);
}
async function startRpcAdapter() {
  rpcServer = createServer(async (request, response) => {
    const name = /^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(request.url || "")?.[1];
    if (request.method !== "POST" || !name || !Object.hasOwn(routines, name) || request.headers.authorization !== "Bearer local-http-proof-key") {
      response.writeHead(404).end(); return;
    }
    try {
      let body = "";
      for await (const chunk of request) { body += chunk; check(body.length <= 3_000_000, "RPC body too large."); }
      const data = await rpc(name, JSON.parse(body));
      if (name === "read_agent_website_work") await writeFile(join(artifacts, "fictional-website-snapshot.json"), JSON.stringify(data, null, 2));
      rpcCalls.set(name, (rpcCalls.get(name) || 0) + 1);
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(data));
    } catch (cause) {
      console.error(`Observed SQL refusal from ${name}: ${cause.message}`);
      response.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ code: "P0001", message: cause.message }));
    }
  });
  await new Promise((ready, reject) => { rpcServer.once("error", reject); rpcServer.listen(0, "127.0.0.1", ready); });
  return `http://127.0.0.1:${rpcServer.address().port}`;
}
async function startNext(adapterUrl) {
  for (const file of ["tsconfig.json", "next-env.d.ts"]) generatedBefore.set(file, await readFile(join(repo, file), "utf8"));
  const port = await localPort();
  const origin = `http://127.0.0.1:${port}`;
  logStream = createWriteStream(join(artifacts, "next.log"));
  // Webpack supports prepared worktrees whose existing dependencies are symlinked.
  next = spawn(process.execPath, [join(repo, "node_modules/next/dist/bin/next"), "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: repo, detached: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...cleanEnv, NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1", PLAYWRIGHT_DIST_DIR: distDir,
      SUPABASE_URL: adapterUrl, SUPABASE_SERVICE_ROLE_KEY: "local-http-proof-key", NEXT_PUBLIC_APP_URL: origin,
      STRELVA_MCP_OAUTH: "1", STRELVA_WORKSPACE_RELEASE: "1", STRELVA_AGENT_IDENTITY_LIMITS: "1" },
  });
  next.stdout.pipe(logStream); next.stderr.pipe(logStream);
  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    check(next.exitCode === null, "Disposable Next server exited before readiness.");
    try {
      const response = await fetch(`${origin}/.well-known/oauth-authorization-server`, { signal: AbortSignal.timeout(15_000) });
      if (response.status === 200) return origin;
    } catch { /* Cold compilation may not have bound the listener yet. */ }
    await new Promise(ready => setTimeout(ready, 500));
  }
  throw new Error("Disposable Next server did not become ready within five minutes.");
}
async function restoreGeneratedTypes() {
  for (const [file, before] of generatedBefore) {
    const current = await readFile(join(repo, file), "utf8");
    if (!current.includes(distDir)) continue;
    if (file === "tsconfig.json") {
      const parsed = JSON.parse(current);
      parsed.include = parsed.include.filter(entry => !entry.startsWith(`${distDir}/`));
      check(JSON.stringify(parsed) === JSON.stringify(JSON.parse(before)), "TypeScript config changed concurrently; retained it for review.");
    } else {
      const withoutImports = text => text.split("\n").filter(line => !/^import "\.\/.*\/types\/(?:routes|root-params)\.d\.ts";$/.test(line)).join("\n");
      check(withoutImports(current) === withoutImports(before), "Next declarations changed concurrently; retained them for review.");
    }
    await writeFile(join(repo, file), before);
  }
}
async function jsonFetch(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(90_000) });
  const body = await response.text();
  let json = null;
  if (body) { try { json = JSON.parse(body); } catch { throw new Error(`Expected JSON from local ${new URL(url).pathname}.`); } }
  return { response, json };
}
async function mcp(origin, method, params = {}, token) {
  return jsonFetch(`${origin}/api/mcp/public`, { method: "POST", headers: {
    "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-11-25",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }, body: JSON.stringify({ jsonrpc: "2.0", id: sequence++, method, params }) });
}
async function tool(origin, name, args = {}, token, status = 200) {
  const result = await mcp(origin, "tools/call", { name, arguments: args }, token);
  check(result.response.status === status, `${name} did not return expected HTTP ${status}.`);
  if (status !== 200) return result;
  check(result.json?.result?.isError === false, `${name} failed through the composed HTTP/SQL path.`);
  return result.json.result.structuredContent;
}
async function issueFixtureCode(resource, scopes) {
  const code = randomBytes(32).toString("base64url"), verifier = randomBytes(32).toString("base64url");
  await rpc("issue_agent_oauth_connection_code", { p_user_id: owner, p_verified_email: ownerEmail, p_workspace_id: business, p_agency_id: null,
    p_code_hash: digest(code), p_client_id: clientId, p_client_name: "Fictional HTTP proof", p_redirect_uri: callback, p_resource: resource,
    p_challenge: createHash("sha256").update(verifier, "ascii").digest("base64url"), p_scopes: scopes }, true);
  return { code, verifier };
}
async function tokenRequest(origin, params, status = 200) {
  const result = await jsonFetch(`${origin}/api/mcp/oauth/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params).toString() });
  check(result.response.status === status, `Token endpoint did not return expected HTTP ${status}.`);
  return result.json;
}
async function exchange(origin, scopes = ["business:read", "website:read", "website:propose"]) {
  const resource = `${origin}/api/mcp/public`, issued = await issueFixtureCode(resource, scopes);
  const params = { grant_type: "authorization_code", client_id: clientId, redirect_uri: callback, resource, code: issued.code, code_verifier: issued.verifier };
  const tokens = await tokenRequest(origin, params);
  check(/^[A-Za-z0-9_-]{43}$/.test(tokens.access_token) && /^[A-Za-z0-9_-]{43}$/.test(tokens.refresh_token) && tokens.business_workspace_id === business, "Code exchange did not issue a business-bound renewable connection.");
  return { tokens, params };
}
async function refresh(origin, tokens, status = 200) {
  return tokenRequest(origin, { grant_type: "refresh_token", client_id: clientId, resource: `${origin}/api/mcp/public`, refresh_token: tokens.refresh_token }, status);
}
async function prove(origin) {
  const resource = `${origin}/api/mcp/public`;
  const protectedMetadata = await jsonFetch(`${origin}/.well-known/oauth-protected-resource/api/mcp/public`);
  check(protectedMetadata.json?.resource === resource, "Protected metadata resource does not equal this local MCP URL.");
  const authorizationMetadata = await jsonFetch(`${origin}/.well-known/oauth-authorization-server`);
  check(authorizationMetadata.json?.issuer === origin && authorizationMetadata.json.grant_types_supported.includes("refresh_token"), "Renewable authorization discovery is missing.");
  const initialize = await mcp(origin, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "local-http-sql-proof", version: "1" } });
  check(initialize.response.status === 200 && initialize.json?.result?.serverInfo?.name === "strelva", "Real HTTP initialize failed.");
  const catalog = await mcp(origin, "tools/list");
  check(catalog.response.status === 200 && ["read_business_context", "list_websites", "read_website", "propose_website_change", "list_website_proposals"].every(name => catalog.json?.result?.tools?.some(row => row.name === name)), "Real HTTP tool catalog is incomplete.");
  const denied = await tool(origin, "read_business_context", {}, undefined, 401);
  check(denied.response.headers.get("www-authenticate")?.includes("resource_metadata="), "Private-tool HTTP 401 lacks discovery challenge.");
  console.log("PASS: real HTTP discovery, initialize, catalog and private-tool 401.");

  const first = await exchange(origin);
  const replay = await tokenRequest(origin, first.params, 400);
  check(replay.error === "invalid_grant", "Code replay was not rejected.");
  const context = await tool(origin, "read_business_context", {}, first.tokens.access_token);
  check(context.workspaceId === business && context.facts.display_name.value === "Fictional HTTP business" && context.facts.description.verified === false, "Selected-business context/provenance failed.");
  await tool(origin, "read_business_context", { workspaceId: otherBusiness }, first.tokens.access_token, 401);
  const listed = await tool(origin, "list_websites", {}, first.tokens.access_token);
  check(listed.workspaceId === business && listed.websites.length === 1 && listed.websites[0].websiteWorkId === website, "Native selected-business website listing failed.");
  const before = await tool(origin, "read_website", { websiteWorkId: website }, first.tokens.access_token);
  check(before.nodes.hero.props.title === "Original headline" && before.approvedRevision === 1 && before.publishedRevision === null, "Native approved website head was not returned.");
  const publicShape = JSON.stringify(before);
  check(!publicShape.includes("private-source") && !publicShape.includes("private-checkpoint"), "Website read exposed fixture-private source/checkpoint data.");
  console.log("PASS: code exchange/replay, business provenance, native website read and cross-business refusal.");

  // Advance only this fixture's expiry; no one-hour sleep and no hosted writes.
  await psql(`update public.assistant_tokens set expires_at=clock_timestamp()-interval '1 second' where token_hash=${sqlValue(digest(first.tokens.access_token), "text")};`);
  await tool(origin, "read_business_context", {}, first.tokens.access_token, 401);
  const renewed = await refresh(origin, first.tokens);
  check(renewed.access_token !== first.tokens.access_token && renewed.refresh_token !== first.tokens.refresh_token, "Refresh did not rotate both credentials.");
  await tool(origin, "read_business_context", {}, renewed.access_token);
  console.log("PASS: expired access returns HTTP 401; real token refresh rotates and restores business access.");

  const proposalArgs = { websiteWorkId: website, requestId: randomUUID(), expectedRevision: before.expectedRevision,
    candidateRevision: before.candidateRevision, candidateContentHash: before.candidateContentHash, summary: "Fictional headline for owner review",
    ops: [{ op: "replace", path: "/nodes/hero/props/title", value: "Proposed headline" }] };
  const proposal = await tool(origin, "propose_website_change", proposalArgs, renewed.access_token);
  check(proposal.status === "awaiting_review" && proposal.liveSiteChanged === false && proposal.revision === 2, "Proposal did not save a new owner-review revision.");
  const retry = await tool(origin, "propose_website_change", proposalArgs, renewed.access_token);
  check(retry.requestId === proposal.requestId && retry.revision === proposal.revision, "Identical proposal retry did not return its existing receipt.");
  const after = await tool(origin, "read_website", { websiteWorkId: website }, renewed.access_token);
  check(after.nodes.hero.props.title === "Proposed headline" && after.candidateRevision === 2 && after.approvedRevision === null && after.publishedRevision === null && after.nodes.hero.verification.needsReview, "Proposal changed neither native candidate nor required approval correctly.");
  const stale = await mcp(origin, "tools/call", { name: "propose_website_change", arguments: { ...proposalArgs, requestId: randomUUID() } }, renewed.access_token);
  check(stale.response.status === 200 && stale.json?.result?.isError === true, "Stale baseline proposal was accepted.");
  const statuses = await tool(origin, "list_website_proposals", { websiteWorkId: website }, renewed.access_token);
  check(statuses.proposals.length === 1 && statuses.proposals[0].status === "awaiting_review", "Proposal review status was not persisted.");
  const publicationCount = await psql(`select count(*) from public.website_document_publications where website_work_id='${website}';`);
  check(publicationCount === "0", "Connector proposal created a website publication.");
  console.log("PASS: native revision proposal, idempotent retry, stale-baseline refusal, review status and no publication.");

  const narrow = await exchange(origin, ["business:read"]);
  const scope = await tool(origin, "list_websites", {}, narrow.tokens.access_token, 403);
  check(scope.response.headers.get("www-authenticate")?.includes('error="insufficient_scope"'), "Insufficient website scope did not return an actionable 403.");
  const ownerConnections = await rpc("list_agent_oauth_connections", { p_user_id: owner, p_verified_email: ownerEmail, p_workspace_id: business }, true);
  const connection = ownerConnections.find(row => row.status === "active" && row.scopes.includes("website:propose"));
  check(Boolean(connection), "Owner connection list cannot identify the renewable website connection.");
  await rpc("disconnect_agent_oauth_connection", { p_user_id: owner, p_verified_email: ownerEmail, p_workspace_id: business, p_connection_id: connection.id }, true);
  await tool(origin, "read_business_context", {}, renewed.access_token, 401);
  check((await refresh(origin, renewed, 400)).error === "invalid_grant", "Owner disconnect did not stop refresh.");
  console.log("PASS: insufficient-scope HTTP 403 and owner SQL disconnect stop HTTP access and refresh.");

  const replayFamily = await exchange(origin);
  const replayRenewed = await refresh(origin, replayFamily.tokens);
  check((await refresh(origin, replayFamily.tokens, 400)).error === "invalid_grant", "Used refresh credential replay was accepted.");
  await tool(origin, "read_business_context", {}, replayRenewed.access_token, 401);
  check((await refresh(origin, replayRenewed, 400)).error === "invalid_grant", "Refresh replay did not revoke the latest family.");
  console.log("PASS: refresh replay revokes the complete family through committed real SQL.");
  const revoked = await exchange(origin);
  const revokeResponse = await fetch(`${origin}/api/mcp/oauth/revoke`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(90_000),
    body: new URLSearchParams({ client_id: clientId, token: revoked.tokens.refresh_token, token_type_hint: "refresh_token" }).toString() });
  check(revokeResponse.status === 200, "RFC7009 client revocation did not succeed.");
  await tool(origin, "read_business_context", {}, revoked.tokens.access_token, 401);
  check((await refresh(origin, revoked.tokens, 400)).error === "invalid_grant", "RFC7009 revocation did not stop renewal.");
  const removed = await exchange(origin);
  await psql(`delete from public.workspace_memberships where workspace_id='${business}' and user_id='${owner}';`);
  await tool(origin, "read_business_context", {}, removed.tokens.access_token, 401);
  check((await refresh(origin, removed.tokens, 400)).error === "invalid_grant", "Removed owner retained renewable access.");
  console.log("PASS: real HTTP client revocation and SQL membership removal both stop access and renewal.");
  for (const name of ["exchange_agent_oauth_connection_code", "refresh_agent_oauth_connection", "call_agent_protected_tool", "list_agent_websites", "read_agent_website_work", "commit_agent_website_candidate", "list_agent_website_proposals"]) check(rpcCalls.has(name), `HTTP proof never reached real SQL routine ${name}.`);
  console.log("Composed local HTTP/SQL proof passed. Supabase sign-in, consent UI, HTTPS hosting, Claude and Croki/Codex native-client proof remain separate.");
}
try {
  await seedFixture();
  const adapterUrl = await startRpcAdapter();
  const origin = await startNext(adapterUrl);
  await prove(origin);
} catch (cause) {
  console.error(`Composed local HTTP/SQL proof failed: ${cause.message}`);
  console.error(`Disposable Next log retained at ${join(artifacts, "next.log")}.`);
  process.exitCode = 1;
} finally {
  if (next?.pid && next.exitCode === null) {
    // This process group was created and retained by this runner alone.
    const closed = once(next, "close");
    try { process.kill(-next.pid, "SIGTERM"); } catch { /* Child already exited. */ }
    await Promise.race([closed, new Promise(ready => setTimeout(ready, 10_000))]);
    if (next.exitCode === null) { try { process.kill(-next.pid, "SIGKILL"); } catch { /* Child already exited. */ } await closed; }
  }
  if (rpcServer) { rpcServer.closeAllConnections(); await new Promise(ready => rpcServer.close(ready)); }
  if (logStream) await new Promise(ready => logStream.end(ready));
  await restoreGeneratedTypes();
  await rm(join(repo, distDir), { recursive: true, force: true });
  if (!process.exitCode) await rm(artifacts, { recursive: true, force: true });
}
