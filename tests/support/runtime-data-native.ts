import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, type APIRequestContext, type Browser } from "@playwright/test";
import { localEnvironment, signedInContext } from "./local-auth";

export const stores = ["spam_held", "inquiry_timeline", "inquiry_reply", "inquiry_delivery", "booking_config", "account_grouping", "orders", "provider_connections", "provider_metadata", "reward_members", "reward_transactions", "threads", "tenant_settings"] as const;
export const secretMarker = "fictional-runtime-proof-secret-never-a-provider-credential";
export const literal = (value: string) => `'${value.replace(/'/g, "''")}'`;
export function localSql(sql: string): string {
  localEnvironment();
  const url = process.env.STRELVA_LOCAL_DB_URL || "";
  if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Requires disposable loopback STRELVA_LOCAL_DB_URL.");
  return execFileSync("psql", [url, "--no-psqlrc", "-At", "--set=ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" }).trim();
}
export async function post(request: APIRequestContext, path: string, data: unknown, status = 200) {
  const response = await request.post(path, { headers: { origin: localEnvironment().app }, data });
  expect(response.status(), await response.text()).toBe(status);
  return response.json();
}
export async function fixture(browser: Browser, role: string) {
  const env = localEnvironment();
  expect(process.env.EMAIL_SENDING_ENABLED).not.toBe("true");
  expect(process.env.CUSTOMER_EMAIL_ENABLED).not.toBe("true");
  expect(process.env.OPERATOR_EMAILS_ENABLED).toBe("false");
  expect(process.env.PROSPECT_EMAILS_ENABLED).toBe("false");
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, role);
  const workspaceId = randomUUID();
  expect((await owner.context.request.get("/api/workspace")).status()).toBe(200);
  expect((await admin.from("workspaces").insert({ id: workspaceId, kind: "customer", name: "Fictional runtime native proof", created_by: owner.userId })).error).toBeNull();
  expect((await admin.from("workspace_memberships").insert({ workspace_id: workspaceId, user_id: owner.userId, role: "owner", created_by: owner.userId })).error).toBeNull();
  const tenants: string[] = [];
  return { env, admin, owner, workspaceId, tenants, async close() {
    // Links deliberately restrict deletion; remove only this fixture's links first.
    localSql(`delete from public.tenant_workspace_links where workspace_id=${literal(workspaceId)}::uuid;`);
    for (const id of tenants) await admin.from("tenants").delete().eq("id", id);
    await admin.from("workspaces").delete().eq("id", workspaceId);
    await owner.context.close();
    await admin.auth.admin.deleteUser(owner.userId);
  } };
}
export async function investigation(f: Awaited<ReturnType<typeof fixture>>) {
  const sources = [];
  for (const text of ["Native local document", "Native local document"]) {
    const doc = await post(f.owner.context.request, "/api/documents", { action: "create", workspaceId: f.workspaceId, input: { title: "Native comparison source", text } });
    sources.push({ workId: doc.workId });
  }
  return post(f.owner.context.request, "/api/bounded-work", { action: "create", productId: "investigations", workspaceId: f.workspaceId, input: { title: "Native local comparison", sources, intervalMinutes: 60 } }, 201);
}
export async function run(f: Awaited<ReturnType<typeof fixture>>, workId: string, revision: number, requestId: string) {
  return post(f.owner.context.request, "/api/bounded-work", { action: "run", productId: "investigations", workId, command: { expectedRevision: revision, requestId } });
}
export async function linkedTenant(f: Awaited<ReturnType<typeof fixture>>, link = true) {
  const id = `native-runtime-${randomUUID()}`;
  const result = await f.admin.from("tenants").insert({ id, site_name: "Fictional local runtime site", active: true, owner_email: f.owner.email }).select("stable_id").single();
  expect(result.error).toBeNull(); f.tenants.push(id);
  const stableId = String(result.data!.stable_id);
  if (link) localSql(`insert into public.tenant_workspace_links(tenant_stable_id,tenant_slug_at_link,workspace_id,linked_by,command_id,command_digest,receipt) values(${literal(stableId)}::uuid,${literal(id)},${literal(f.workspaceId)}::uuid,${literal(f.owner.userId)}::uuid,${literal(randomUUID())}::uuid,${literal("a".repeat(64))},'{}');`);
  return { id, stableId };
}
export function storePayload(store: typeof stores[number], tenantId: string) {
  const at = "2026-10-08T12:00:00Z";
  const common = { id: "native-record", fixture: true, createdAt: at, updatedAt: at };
  switch (store) {
    case "provider_connections": return { ...common, tenantId, provider: "google", status: "connected", accessToken: secretMarker, connectedAt: at };
    case "provider_metadata": return { value: { accountName: "Fictional Google account", locationId: "fixture-only-location" } };
    case "tenant_settings": return { value: "Fictional goal" };
    case "booking_config": return { value: { timezone: "UTC", enabled: false } };
    case "account_grouping": return { ...common, tenantIds: [tenantId], name: "Fictional grouping", status: "active" };
    case "inquiry_timeline": return { ...common, at, kind: "fixture" };
    case "inquiry_reply": return { firstReplyAt: at, by: "owner", action: "reply" };
    case "inquiry_delivery": return { kind: "checkpoint", key: "fixture:reply", value: { inquiryId: "native-record", status: "accepted", acceptedAt: at, replyTo: secretMarker, attemptId: secretMarker, messageDigest: secretMarker } };
    case "orders": return { ...common, externalId: "fixture-external", verification: "site-signature", amountCents: 0, currency: "usd", itemCount: 0, items: [] };
    default: return common;
  }
}
export async function seedStores(admin: SupabaseClient, tenantId: string) {
  for (const store of stores) {
    const payload = storePayload(store, tenantId);
    const result = await admin.rpc("record_tenant_client_record", { p_tenant_id: tenantId, p_store: store, p_record_id: store === "provider_connections" || store === "provider_metadata" ? "google" : "native-record", p_payload: payload, p_payload_hash: createHash("sha256").update(JSON.stringify(payload)).digest("hex"), p_captured_at: "2026-10-08T12:00:00Z", p_via: "backfill", p_mode: store === "inquiry_reply" ? "keep_first" : "replace" });
    expect(result.error, `${store}: ${result.error?.message}`).toBeNull();
  }
}
