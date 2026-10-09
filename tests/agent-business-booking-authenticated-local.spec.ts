import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { localEnvironment, signedInContext } from "./support/local-auth";
import { localSql } from "./support/journeys";
import { issueAssistantFixture, moneyPost, nativeWorkspace } from "./support/money-agent-native";

// This is bounded native authority/discovery/disabled-admission proof only.
// Public CIMD consent, a held booking, delivered customer email, successful
// customer confirmation and provider calendar outcomes remain separate gates.
test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires isolated local Auth/database; does not qualify successful agent booking delivery.");
test.setTimeout(120_000);

async function mcp(request: APIRequestContext, name: string, args: Record<string, unknown>, token?: string, status = 200) {
  const response = await request.post("/api/mcp/public", {
    headers: { accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-11-25", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    data: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } },
  });
  expect(response.status(), await response.text()).toBe(status);
  return status === 401 ? null : response.json();
}

function effects(workspaceId: string) {
  return localSql<{ bookings: number; access: number; updates: number; history: number; confirmations: number }>(`
    select jsonb_build_object(
      'bookings',(select count(*) from public.business_bookings where workspace_id=:'v1'::uuid),
      'access',(select count(*) from public.business_booking_access a join public.business_bookings b on b.id=a.booking_id where b.workspace_id=:'v1'::uuid),
      'updates',(select count(*) from public.business_booking_updates u join public.business_booking_history h on h.id=u.history_id join public.business_bookings b on b.id=h.booking_id where b.workspace_id=:'v1'::uuid),
      'history',(select count(*) from public.business_booking_history h join public.business_bookings b on b.id=h.booking_id where b.workspace_id=:'v1'::uuid),
      'confirmations',(select count(*) from public.business_booking_access a join public.business_bookings b on b.id=a.booking_id where b.workspace_id=:'v1'::uuid and a.confirmed_at is not null));`, workspaceId);
}

/** Explicit native setup fixture, never a production release or provider binding. */
function seedNativePublicBooking(workspaceId: string, owner: { userId: string; email: string }, serviceId: string) {
  const systemId = randomUUID(), revisionId = randomUUID();
  localSql(`
    insert into public.business_records(workspace_id,created_by,updated_by) values(:'v1'::uuid,:'v2'::uuid,:'v2'::uuid) on conflict do nothing;
    select public.patch_business_record(:'v1'::uuid,:'v2'::uuid,:'v3','owner',
      (select revision from public.business_records where workspace_id=:'v1'::uuid),
      jsonb_build_object('facts',jsonb_build_object('display_name',jsonb_build_object('value','Native disabled-admission fixture','verified',true))),
      gen_random_uuid(),repeat('a',64)) \\g /dev/null
    insert into public.business_services(id,workspace_id,name,duration_minutes,active,source,verified,created_by,updated_by)
      values(:'v4'::uuid,:'v1'::uuid,'Local consultation',30,true,'owner',true,:'v2'::uuid,:'v2'::uuid);
    insert into public.systems(id,business_workspace_id,name,kind,command_id,command_digest,created_by,updated_by)
      values(:'v5'::uuid,:'v1'::uuid,'Bookings','booking',gen_random_uuid(),repeat('b',64),:'v2'::uuid,:'v2'::uuid);
    insert into public.system_revisions(id,system_id,business_workspace_id,number,implementation,command_id,command_digest,created_by)
      values(:'v6'::uuid,:'v5'::uuid,:'v1'::uuid,1,'{"kind":"booking","ref":"native-bookings"}',gen_random_uuid(),repeat('c',64),:'v2'::uuid);
    update public.systems set lifecycle='live',current_revision_id=:'v6'::uuid,current_revision_number=1 where id=:'v5'::uuid;
    insert into public.booking_settings(calendar_key,workspace_id,mode,buffer_minutes,min_notice_minutes,recorded_via)
      values(:'v1'::uuid,:'v1'::uuid,'request',0,0,'native');
    insert into public.workspace_release_flags(workspace_id,flag,state,changed_by)
      values(:'v1'::uuid,'systems','on',:'v2'::uuid),(:'v1'::uuid,'connected_sites','on',:'v2'::uuid),(:'v1'::uuid,'agent_channel','off',:'v2'::uuid)
      on conflict(workspace_id,flag) do update set state=excluded.state;
  `, workspaceId, owner.userId, owner.email, serviceId, systemId, revisionId);
}

test("bounded issuer fixture: native owner context stays business-bound and current authority removal stops access", async ({ browser }) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, "agent-booking-owner");
  const other = await signedInContext(browser, admin, "agent-booking-other");
  try {
    const workspaceId = await nativeWorkspace(owner.context.request);
    const otherWorkspaceId = await nativeWorkspace(other.context.request);
    const fixture = await issueAssistantFixture(admin, owner, workspaceId);
    const exchanged = await owner.context.request.post("/api/mcp/oauth/token", { form: {
      grant_type: "authorization_code", client_id: fixture.clientId, resource: fixture.resource,
      code: fixture.code, code_verifier: fixture.verifier, redirect_uri: fixture.redirectUri,
    } });
    expect(exchanged.status(), await exchanged.text()).toBe(200);
    const tokens = await exchanged.json();
    const before = effects(workspaceId);
    const context = await mcp(owner.context.request, "read_business_context", {}, tokens.access_token);
    expect(context.result.isError).toBe(false);
    expect(context.result.structuredContent.workspaceId).toBe(workspaceId);
    await mcp(owner.context.request, "read_business_context", { workspaceId: otherWorkspaceId }, tokens.access_token, 401);
    await mcp(other.context.request, "read_business_context", { workspaceId }, undefined, 401);
    await moneyPost(other.context.request, "/api/workspace/agent-channel", { workspaceId, consented: true, reason: "Unauthorized account must not consent" }, 403);
    expect(effects(workspaceId)).toEqual(before);
    const removed = await admin.from("workspace_memberships").delete().eq("workspace_id", workspaceId).eq("user_id", owner.userId);
    expect(removed.error).toBeNull();
    await mcp(owner.context.request, "read_business_context", {}, tokens.access_token, 401);
    await moneyPost(owner.context.request, "/api/workspace/agent-channel", { workspaceId, consented: true, reason: "Removed owner must not consent" }, 403);
    expect(effects(workspaceId)).toEqual(before);
  } finally { await Promise.all([owner.context.close(), other.context.close()]); }
});

test("native public booking discovery, disabled admission, scanner preview and status rate limits produce no booking effect", async ({ browser }, info) => {
  const env = localEnvironment();
  // Never enable sending for this test. Auth's local mail sink does not qualify app email.
  expect(process.env.CUSTOMER_EMAIL_ENABLED).not.toBe("true");
  expect(process.env.STRELVA_AGENT_IDENTITY_LIMITS).toBe("1");
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, "agent-booking-public-owner");
  const visitor = await browser.newContext({ baseURL: env.app });
  try {
    const workspaceId = await nativeWorkspace(owner.context.request);
    const serviceId = randomUUID();
    const handle = `local-agent-${randomUUID().slice(0, 8)}`;
    seedNativePublicBooking(workspaceId, owner, serviceId);
    // Public discovery uses the owner's confirmed copy, never raw/verified rows.
    const pending = await owner.context.request.get(`/api/workspace/needs-you?workspaceId=${workspaceId}`);
    expect(pending.status(), await pending.text()).toBe(200);
    const confirmation = (await pending.json()).items.find((item: { sourceLifecycle: string; sourceId: string }) =>
      item.sourceLifecycle === "business_facts" && item.sourceId === workspaceId);
    expect(confirmation, "Seeded business/service details require an actual owner decision").toBeTruthy();
    const confirmed = await moneyPost(owner.context.request, "/api/workspace/needs-you", {
      workspaceId, itemId: confirmation.id, revision: confirmation.revisionHash, decision: "approve",
    });
    expect(confirmed.status).toBe("done");
    expect(localSql(`select to_jsonb(count(*)) from public.business_record_confirmed where workspace_id=:'v1'::uuid and entity='service' and entity_id=:'v2'`, workspaceId, serviceId)).toBe(1);
    await moneyPost(owner.context.request, "/api/workspace/connected-sites/visibility", { action: "page", workspaceId, handle, published: true });
    const consent = await moneyPost(owner.context.request, "/api/workspace/agent-channel", { workspaceId, consented: true, reason: "Local fixture owner consent; delivery remains disabled" });
    expect(consent).toEqual({ consented: true });
    const consentReceipts = localSql<{ count: number; consented: boolean }>(`select jsonb_build_object('count',count(*),'consented',bool_and(consented)) from public.agent_channel_consent_receipts where workspace_id=:'v1'::uuid`, workspaceId);
    expect(consentReceipts).toEqual({ count: 1, consented: true });
    const business = `biz:${handle}`;
    const before = effects(workspaceId);
    expect(before).toEqual({ bookings: 0, access: 0, updates: 0, history: 0, confirmations: 0 });
    const details = await mcp(visitor.request, "get_business", { business });
    expect(details.result.isError).toBe(false);
    const services = await mcp(visitor.request, "list_services", { business });
    expect(services.result.isError).toBe(false);
    expect(services.result.structuredContent.services).toEqual(expect.arrayContaining([expect.objectContaining({ id: serviceId, name: "Local consultation" })]));
    const denied = await mcp(visitor.request, "request_booking", { business, serviceId,
      start: new Date(Date.now() + 4 * 86_400_000).toISOString(), requestId: `local-${randomUUID()}`,
      agent: { name: "Bounded native booking fixture" }, customer: { name: "Local customer", email: `local-${randomUUID()}@example.test` },
    });
    expect(denied.result.isError).toBe(true);
    expect(JSON.stringify(denied)).toContain("Customer confirmation is not available");
    // An unpublished/internal workspace identifier is never a public business handle.
    const privateScope = await mcp(visitor.request, "request_booking", { business: `workspace:${workspaceId}`, serviceId,
      start: new Date(Date.now() + 4 * 86_400_000).toISOString(), requestId: `local-${randomUUID()}`,
      agent: { name: "Bounded native booking fixture" }, customer: { name: "Local customer", email: "private-scope@example.test" },
    });
    expect(privateScope.result.isError).toBe(true);
    const unknownToken = randomBytes(32).toString("base64url");
    const page = await visitor.newPage();
    await page.goto(`/booking-confirm/${unknownToken}`);
    await expect(page.getByRole("heading", { name: "Confirm your booking request", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm my email and request this time", exact: true })).toBeVisible();
    expect(effects(workspaceId)).toEqual(before);
    const crossOrigin = await visitor.request.post(`/booking-confirm/${unknownToken}/action`, { headers: { origin: "https://untrusted.example.test" }, maxRedirects: 0 });
    expect(crossOrigin.status(), await crossOrigin.text()).toBe(403);
    await page.getByRole("button", { name: "Confirm my email and request this time", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("This confirmation could not complete.");
    await page.screenshot({ path: info.outputPath("native-agent-disabled-confirmation.png"), fullPage: true });
    // Thirty reads of this unique opaque status identity are allowed; the 31st
    // reaches the actual native limiter, without a generated booking/token.
    for (let attempt = 0; attempt < 30; attempt++) {
      const absent = await mcp(visitor.request, "get_booking_status", { business, statusToken: unknownToken });
      expect(absent.result.isError).toBe(true);
    }
    const limited = await mcp(visitor.request, "get_booking_status", { business, statusToken: unknownToken }, undefined, 429);
    expect(limited.error.message).toBe("Too many requests.");
    expect(effects(workspaceId)).toEqual(before);
    expect(localSql(`select to_jsonb(count(*)) from public.agent_channel_consent_receipts where workspace_id=:'v1'::uuid`, workspaceId)).toBe(1);
  } finally { await Promise.all([owner.context.close(), visitor.close()]); }
});
