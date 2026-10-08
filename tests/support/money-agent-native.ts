import { createHash, randomBytes, randomUUID } from "node:crypto";
import { expect, type APIRequestContext } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { localEnvironment } from "./local-auth";

export async function nativeWorkspace(request: APIRequestContext): Promise<string> {
  localEnvironment();
  const response = await request.get("/api/workspace");
  expect(response.status(), await response.text()).toBe(200);
  const body = await moneyPost(request, "/api/workspace/businesses", {
    destination: { kind: "new", name: "Native money and assistant proof business" },
    initialRequest: null, idempotencyKey: randomUUID(),
  });
  expect(body.workspaceId).toMatch(/^[0-9a-f-]{36}$/);
  return body.workspaceId;
}

export async function moneyPost(request: APIRequestContext, path: string, data: unknown, status = 200) {
  const response = await request.post(path, { headers: { origin: localEnvironment().app }, data });
  expect(response.status(), await response.text()).toBe(status);
  return response.json();
}

/** Bounded SQL issuer fixture only. Does not prove public CIMD retrieval or consent. */
export async function issueAssistantFixture(admin: SupabaseClient, actor: { userId: string; email: string }, workspaceId: string) {
  const env = localEnvironment();
  const clientId = "https://assistant-fixture.example.test/client.json";
  const clientName = "Bounded issuer fixture assistant";
  const resource = new URL("/api/mcp/public", process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || env.app).href;
  const code = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const sha = (value: string, encoding: "hex" | "base64url") => createHash("sha256").update(value).digest(encoding);
  const issued = await admin.rpc("issue_agent_oauth_connection_code", {
    p_user_id: actor.userId, p_verified_email: actor.email, p_workspace_id: workspaceId, p_agency_id: null,
    p_code_hash: sha(code, "hex"), p_client_id: clientId, p_client_name: clientName,
    p_redirect_uri: `${env.app}/fixture-callback`, p_resource: resource, p_challenge: sha(verifier, "base64url"),
    p_scopes: ["business:read", "website:read"],
  });
  expect(issued.error).toBeNull();
  return { clientId, clientName, resource, code, verifier, redirectUri: `${env.app}/fixture-callback` };
}
