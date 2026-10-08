#!/usr/bin/env node
/** Unauthenticated, read-only readiness probe. No tokens, consent, bookings,
 * inquiries, provider calls or business writes. It does not prove Claude use. */
import assert from "node:assert/strict";

const origin = new URL(process.argv[2] || "http://localhost:3137");
assert(!origin.username && !origin.password && !origin.search && !origin.hash && origin.pathname === "/",
  "Pass an origin only, with no credentials or path.");
assert(origin.protocol === "https:" || origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname),
  "Use HTTPS, or HTTP on loopback only.");
const endpoint = new URL("/api/mcp/public", origin);
async function get(path) {
  const response = await fetch(new URL(path, origin), { redirect: "error", signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200, path + " must be available");
  return response.json();
}
async function post(method, params) {
  return fetch(endpoint, { method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-11-25" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
}
try {
  const protectedMetadata = await get("/.well-known/oauth-protected-resource/api/mcp/public");
  assert.equal(protectedMetadata.resource, endpoint.href);
  assert.deepEqual(protectedMetadata.scopes_supported, ["business:read"]);
  assert.equal(protectedMetadata.authorization_servers[0], origin.origin);
  const oauth = await get("/.well-known/oauth-authorization-server");
  assert.equal(oauth.issuer, origin.origin);
  assert.equal(oauth.client_id_metadata_document_supported, true);
  assert(oauth.token_endpoint_auth_methods_supported.includes("none"));
  assert(oauth.code_challenge_methods_supported.includes("S256"));
  for (const key of ["authorization_endpoint", "token_endpoint", "revocation_endpoint"])
    assert.equal(new URL(oauth[key]).origin, origin.origin);
  const initialize = await post("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "strelva-readiness-check", version: "1" } });
  assert.equal(initialize.status, 200);
  assert.equal((await initialize.json()).result.protocolVersion, "2025-11-25");
  const list = await post("tools/list", {});
  assert.equal(list.status, 200);
  const tool = (await list.json()).result.tools.find(t => t.name === "read_business_context");
  assert(tool?.annotations.readOnlyHint, "Business context must be read-only");
  assert(tool.inputSchema.oneOf.some(s => s.not?.anyOf), "First call must support no business selector");
  const refusal = await post("tools/call", { name: "read_business_context", arguments: {} });
  assert.equal(refusal.status, 401, "Private context must challenge before running");
  const challenge = refusal.headers.get("www-authenticate");
  assert(challenge?.includes('scope="business:read"'));
  assert(challenge.includes('resource_metadata="' + new URL("/.well-known/oauth-protected-resource/api/mcp/public", origin).href + '"'));
  console.log("PASS: discovery, CIMD/PKCE metadata, legacy handshake, first-call schema and private-context 401.");
  console.log("Not proven: real Claude sign-in, consent, token exchange/renewal, client data or website edits.");
} catch (error) {
  console.error("FAIL: " + error.message);
  process.exitCode = 1;
}
