import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { localEnvironment, signedInContext } from "./support/local-auth";

test.skip(process.env.STRELVA_CONTENT_AUTHORITY_HTTP_PROOF !== "1", "Requires the owned disposable loopback HTTP runner.");
test.setTimeout(180_000);
test.use({ actionTimeout: 90_000 });

function sql(query: string): string {
  const url = process.env.STRELVA_LOCAL_DB_URL || "";
  if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Only the disposable loopback database is permitted.");
  return execFileSync("psql", [url, "-X", "-v", "ON_ERROR_STOP=1", "-Atq", "-c", query], { encoding: "utf8" }).trim();
}

test("owner and actual provider publish through HTTP; linked admin cannot change accepted content or receipts", async ({ browser }, testInfo) => {
  const env = localEnvironment();
  expect(process.env.STRELVA_OPERATOR_QUEUE_RELEASE).toBe("1");
  for (const source of ["CONTENT_SOURCE", "DATA_SOURCE", "TENANTS_SOURCE"]) expect(process.env[source], source).toBe("postgres");
  for (const bypass of ["REB_DEV_UNGATED_ACCESS", "SCAFFOLD_DEV_UNGATED_ACCESS"]) expect(process.env[bypass], bypass).toBe("0");
  expect(sql("select count(*) from supabase_migrations.schema_migrations where version in ('20261020110000','20261020112000')")).toBe("2");
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, "content-owner");
  const provider = await signedInContext(browser, admin, "content-provider");
  const outsider = await signedInContext(browser, admin, "content-linked-admin");
  const business = randomUUID(), agency = randomUUID(), stable = randomUUID();
  const tenant = `content-${stable.slice(0, 8)}`;
  const route = `/client/${tenant}/api/content/hero`;
  const publishRoute = `/client/${tenant}/api/publish`;
  const headers = { origin: env.app };
  const hero = (headline: string) => ({ headline, subheadline: "Local fixture only", tagline: "Buffalo", ctaText: "Contact", ctaLink: "#contact", backgroundImageUrl: "" });
  const receipts = () => JSON.parse(sql(`select coalesce(jsonb_agg(public.outside_write_receipt_row(id) order by created_at,id),'[]'::jsonb) from public.outside_write_receipts where tenant_id='${tenant}'`)) as Array<Record<string, unknown>>;
  const state = () => sql(`select jsonb_build_object('content',(select data from public.content where tenant_id='${tenant}' and section='hero'),'receipts',(select coalesce(jsonb_agg(to_jsonb(r) order by created_at,id),'[]'::jsonb) from public.outside_write_receipts r where tenant_id='${tenant}'))`);
  try {
    // Synthetic local configuration; sessions above use the real Auth service.
    sql(`insert into public.users(id,email,verified_at) values ('${owner.userId}','${owner.email}',now()),('${provider.userId}','${provider.email}',now()),('${outsider.userId}','${outsider.email}',now()) on conflict(id) do update set verified_at=excluded.verified_at;
      insert into public.workspaces(id,kind,name,created_by) values ('${business}','customer','HTTP fixture business','${owner.userId}'),('${agency}','agency','Actual HTTP Agency','${provider.userId}');
      insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values ('${business}','${owner.userId}','owner','${owner.userId}'),('${business}','${outsider.userId}','admin','${owner.userId}'),('${agency}','${provider.userId}','owner','${provider.userId}');
      insert into public.tenants(id,stable_id,site_name,active,template) values ('${tenant}','${stable}','HTTP fixture business',true,'wellness');
      insert into public.memberships(user_id,tenant_id,role) values ('${owner.userId}','${tenant}','owner'),('${provider.userId}','${tenant}','editor'),('${outsider.userId}','${tenant}','admin');
      insert into public.tenant_workspace_links(tenant_stable_id,tenant_slug_at_link,workspace_id,linked_by,command_id,command_digest,receipt) values ('${stable}','${tenant}','${business}','${owner.userId}',gen_random_uuid(),repeat('a',64),'{}');
      insert into public.workspace_providers(customer_workspace_id,provider_workspace_id,source,started_by) values ('${business}','${agency}','business_choice','${owner.userId}');
      insert into public.provider_seats(customer_workspace_id,agency_workspace_id,granted_by_kind,granted_by) values ('${business}','${agency}','owner','${owner.userId}');
      insert into public.agency_client_staff(agency_workspace_id,customer_workspace_id,user_id,assigned_by) values ('${agency}','${business}','${provider.userId}','${provider.userId}');
      insert into public.agency_verifications(agency_workspace_id,effect,status,evidence,verified_by,verifier_is_agency_member) values ('${agency}','publish','verified','{"fixture":"local only; no outside verification claim"}','${outsider.userId}',false);
      select public.grant_client_resource_mandate('${owner.userId}','${owner.email}','${business}','${agency}','publish','website',public.system_origin_id('${business}','tenant','${stable}')::text);`);
    expect(sql(`select count(*) from public.super_admins where user_id in ('${owner.userId}','${provider.userId}','${outsider.userId}')`)).toBe("0");
    const put = await owner.context.request.put(route, { headers, data: hero("Accepted owner HTTP edit") });
    expect(put.status(), await put.text()).toBe(200);
    expect((await owner.context.request.get(route)).status()).toBe(200);
    expect(await (await owner.context.request.get(route)).json()).toEqual(hero("Accepted owner HTTP edit"));
    expect(receipts()).toHaveLength(1);
    expect(receipts()[0]).toMatchObject({ acceptance: "accepted", readback: "matched", actor: owner.userId, provider: "strelva_content", request: { authorship: { authority: "owner", actorUserId: owner.userId, provider: null } } });

    const draft = await owner.context.request.put(`${route}?draft=true`, { headers, data: hero("Accepted owner draft publication") });
    expect(draft.status(), await draft.text()).toBe(200);
    expect(receipts()).toHaveLength(1);
    const publish = await owner.context.request.post(publishRoute, { headers });
    expect(publish.status(), await publish.text()).toBe(200);
    // This synthetic custom repo has no outside storefront URL. Accepted
    // content and matching projection must remain separate from that failure.
    expect(await publish.json()).toMatchObject({ success: true, publishedSections: ["hero"], liveSite: { status: "failed", error: "Missing revalidateUrl" } });
    expect(receipts()).toHaveLength(2);
    expect(receipts()[1]).toMatchObject({ acceptance: "accepted", readback: "matched", actor: owner.userId, request: { authorship: { authority: "owner", actorUserId: owner.userId, provider: null } } });

    const providerPut = await provider.context.request.put(route, { headers, data: hero("Accepted actual agency HTTP edit") });
    expect(providerPut.status(), await providerPut.text()).toBe(200);
    expect(receipts()).toHaveLength(3);
    expect(receipts()[2]).toMatchObject({ acceptance: "accepted", readback: "matched", actor: provider.userId, provider: "strelva_content", request: { authorship: { authority: "provider", actorUserId: provider.userId, provider: { workspaceId: agency, name: "Actual HTTP Agency" } } } });

    // Both legacy content permission and direct client admin membership exist;
    // neither grants the new writer owner/provider authority.
    const before = state();
    const denied = await outsider.context.request.put(route, { headers, data: hero("Unauthorized linked admin edit") });
    expect(denied.status(), await denied.text()).toBe(500);
    expect(await denied.json()).toEqual({ error: "Failed to save content" });
    expect(state()).toBe(before);
    const pendingDraft = await owner.context.request.put(`${route}?draft=true`, { headers, data: hero("Must stay a draft") });
    expect(pendingDraft.status(), await pendingDraft.text()).toBe(200);
    const deniedPublish = await outsider.context.request.post(publishRoute, { headers });
    expect(deniedPublish.status(), await deniedPublish.text()).toBe(500);
    expect(await deniedPublish.json()).toEqual({ error: "Failed to publish changes" });
    expect(state()).toBe(before);
    expect(sql(`select data->>'headline' from public.draft_content where tenant_id='${tenant}' and section='hero'`)).toBe("Must stay a draft");
    // Revocation is checked on a fresh HTTP request, with legacy permission retained.
    sql(`update public.workspace_memberships set role='admin' where workspace_id='${business}' and user_id='${owner.userId}'`);
    const revoked = await owner.context.request.put(route, { headers, data: hero("Revoked owner edit") });
    expect(revoked.status(), await revoked.text()).toBe(500);
    expect(state()).toBe(before);
    const revokedPublish = await owner.context.request.post(publishRoute, { headers });
    expect(revokedPublish.status(), await revokedPublish.text()).toBe(500);
    expect(state()).toBe(before);
    expect(await (await provider.context.request.get(route)).json()).toEqual(hero("Accepted actual agency HTTP edit"));
    await testInfo.attach("accepted-receipts-and-refusals", { body: JSON.stringify({ tenant, receipts: receipts(), linkedAdminStatus: denied.status(), linkedAdminPublishStatus: deniedPublish.status(), revokedOwnerStatus: revoked.status(), revokedOwnerPublishStatus: revokedPublish.status(), acceptedStatePreserved: state() === before }, null, 2), contentType: "application/json" });
  } finally {
    // The runner destroys this entire synthetic database, including immutable
    // receipts. Teardown never removes issued receipts through a live API.
    await Promise.all([owner.context.close(), provider.context.close(), outsider.context.close()]);
  }
});
