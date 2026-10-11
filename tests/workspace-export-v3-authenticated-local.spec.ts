import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { signedInContext } from "./support/local-auth";
import { fixture, investigation, linkedTenant, literal, localSql, post, run, secretMarker, seedStores } from "./support/runtime-data-native";
import { V3_CATEGORIES } from "../src/platform/workspace-exports/v3";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires current local Auth/schema, STRELVA_EXPORT_SCHEMA_3=1 and paused external delivery.");
test.setTimeout(180_000);
test("owner downloads real schema-3 categories after exit pauses work; linked-tenant masking, retained history and withdrawn agency authority hold", async ({ browser }) => {
  const f = await fixture(browser, "export-v3-owner");
  const agency = await signedInContext(browser, f.admin, "export-v3-agency");
  const agencyId = randomUUID();
  try {
    // This test requires external delivery disabled; it never sends owner email.
    expect(process.env.EMAIL_SENDING_ENABLED).not.toBe("true");
    expect(process.env.CUSTOMER_EMAIL_ENABLED).not.toBe("true");
    await agency.context.request.get("/api/workspace");
    expect((await f.admin.from("workspaces").insert({ id: agencyId, kind: "agency", name: "Fictional export agency", created_by: agency.userId })).error).toBeNull();
    expect((await f.admin.from("workspace_memberships").insert({ workspace_id: agencyId, user_id: agency.userId, role: "owner", created_by: agency.userId })).error).toBeNull();
    const linked = await linkedTenant(f); const outside = await linkedTenant(f, false);
    await seedStores(f.admin, linked.id); await seedStores(f.admin, outside.id);
    const created = await investigation(f); await run(f, created.id, 0, "native-export-check");
    const sourceId = created.payload.sources[0].workId;
    const delegation = await f.admin.from("workspace_delegations").insert({ customer_workspace_id: f.workspaceId, customer_work_id: sourceId, agency_workspace_id: agencyId, scope: ["work:read"], status: "active", granted_by: f.owner.userId, accepted_by: agency.userId }).select("id").single();
    expect(delegation.error).toBeNull();
    expect((await agency.context.request.get(`/api/documents?workId=${sourceId}`)).status()).toBe(200);
    expect((await agency.context.request.post("/api/workspace-export/v3", { headers: { origin: f.env.app }, data: { workspaceId: f.workspaceId } })).status()).toBe(403);
    // Fixture withdrawal exercises actual Auth reads; it is not a provider write.
    localSql(`update public.workspace_delegations set status='revoked' where id=${literal(String(delegation.data!.id))}::uuid;`);
    expect((await agency.context.request.get(`/api/documents?workId=${sourceId}`)).status()).toBe(403);
    const exit = await post(f.owner.context.request, "/api/workspace-exit", { workspaceId: f.workspaceId, futureWork: "pause", providerParticipation: "revoke", maintainedResources: { kind: "stop" }, idempotencyKey: randomUUID() });
    expect(exit.state).toMatchObject({ status: "completed", futureWork: "paused", providerParticipation: "revoked" });
    const retained = await f.owner.context.request.get(`/api/bounded-work?productId=investigations&workId=${created.id}&view=history`);
    expect(retained.status()).toBe(200); expect((await retained.json()).runs[0].run.requestId).toBe("native-export-check");
    const queued = await post(f.owner.context.request, "/api/workspace-export/v3", { workspaceId: f.workspaceId }, 202);
    await expect.poll(async () => {
      const response = await f.owner.context.request.get(`/api/workspace-export/v3/status?build=${queued.buildId}`);
      expect(response.status(), await response.text()).toBe(200); return (await response.json()).status;
    }, { timeout: 90_000 }).toBe("ready");
    const download = await f.owner.context.request.get(`/api/workspace-export/v3/owner-download?build=${queued.buildId}`);
    expect(download.status(), await download.text()).toBe(200);
    const document = await download.json(); expect(document.schemaVersion).toBe(3);
    const classified = [...document.manifest.included, ...document.manifest.unavailable].map((item: { category: string }) => item.category);
    for (const category of V3_CATEGORIES) expect(classified).toContain(category);
    for (const category of ["orders", "reward_members", "reward_transactions", "threads", "tenant_settings", "provider_metadata", "inquiry_delivery", "spam_held", "inquiry_timelines", "inquiry_first_replies", "booking_config", "investigation_history"]) expect(document.data[category].length, category).toBeGreaterThan(0);
    const body = JSON.stringify(document); expect(body).not.toContain(outside.id); expect(body).not.toContain(secretMarker);
    expect(body, "Provider ciphertext must be excluded along with plaintext secrets.").not.toContain("enc:v1:");
    expect(document.workspaceSnapshot.lifecycle.exit).toMatchObject({ status: "completed", futureWork: "paused" });
    const category = await f.admin.rpc("export_workspace_v3_category", { p_workspace_id: f.workspaceId, p_user_id: f.owner.userId, p_verified_email: f.owner.email, p_category: "orders", p_offset: 0, p_limit: 1 });
    expect(category.error).toBeNull(); expect(category.data.items[0].tenantId).toBe(linked.id); expect(category.data.next).toBe(1);
    const receipt = localSql(`select count(*) from public.workspace_export_receipts where workspace_id=${literal(f.workspaceId)}::uuid and schema_version=3;`); expect(Number(receipt)).toBeGreaterThan(0);
    expect((await f.admin.from("workspace_memberships").delete().eq("workspace_id", f.workspaceId).eq("user_id", f.owner.userId)).error).toBeNull();
    expect((await f.owner.context.request.get(`/api/workspace-export/v3/owner-download?build=${queued.buildId}`)).status()).toBe(404);
  } finally {
    localSql(`delete from public.workspace_delegations where agency_workspace_id=${literal(agencyId)}::uuid;`);
    await f.admin.from("workspaces").delete().eq("id", agencyId);
    await agency.context.close(); await f.admin.auth.admin.deleteUser(agency.userId); await f.close();
  }
});
