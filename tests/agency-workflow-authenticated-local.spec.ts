import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect as baseExpect, test, type APIRequestContext, type Page } from "@playwright/test";
import { buildWorkspaceApproveUrl } from "@/lib/approve-link";
import { unresolvedSiteFacts } from "@/products/websites/site-document";
import type { WebsiteRebuildRecord } from "@/products/websites/rebuild-contracts";
import { localEnvironment, signedInContext } from "./support/local-auth";

// Real Auth/Postgres and production routes, including the rules-only website
// pipeline. Nothing mocks app responses or calls a paid model/email provider.
// Setup fixtures are an agency-owned prospect, a fictional delivered approval
// email and a reviewed publish verification. Delivery transport is simulated
// only in the disposable database; no email leaves and nobody gains platform
// operator privileges.
test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires isolated local Supabase Auth and Postgres.");
test.setTimeout(360_000);
test.use({ actionTimeout: 120_000, navigationTimeout: 120_000 });
const expect = baseExpect.configure({ timeout: 60_000 });

function sql(query: string): string {
  const url = process.env.STRELVA_LOCAL_DB_URL || "";
  if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Set STRELVA_LOCAL_DB_URL to the disposable loopback database.");
  return execFileSync("psql", [url, "-X", "-v", "ON_ERROR_STOP=1", "-Atq", "-c", query], { encoding: "utf8" }).trim();
}

function selection(record: WebsiteRebuildRecord) {
  const candidate = record.rebuild.candidate!;
  return { expectedRevision: record.rebuild.revision, candidateRevision: candidate.revision, candidateContentHash: candidate.contentHash };
}

async function read(request: APIRequestContext, workId: string): Promise<WebsiteRebuildRecord> {
  const response = await request.get(`/api/websites/${workId}/rebuild`);
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

async function fits(page: Page) {
  await expect.poll(() => page.evaluate(() => {
    const main = document.getElementById("strelva-main");
    const width = innerWidth;
    if (document.documentElement.scrollWidth > width + 1) return false;
    if (!main) return true;
    const bounds = main.getBoundingClientRect();
    // Hidden outer overflow can conceal an offscreen main or a nested
    // horizontal scroller. Check their actual geometry, not just the document.
    if (bounds.right > width + 1 || (width <= 1023 && (Math.abs(bounds.left) > 1 || bounds.width < width - 1))) return false;
    return [main, ...main.querySelectorAll<HTMLElement>("*")].every(element => {
      const overflow = getComputedStyle(element).overflowX;
      return !["auto", "scroll", "hidden"].includes(overflow) || element.clientWidth === 0 || element.scrollWidth <= element.clientWidth + 1;
    });
  })).toBe(true);
}

test("ordinary agency adds a client, gets the owner's exact approval, publishes, and reads the receipt", async ({ browser }, testInfo) => {
  const env = localEnvironment();
  if (!process.env.APPROVE_LINK_SECRET) throw new Error("Set the same local APPROVE_LINK_SECRET on the app server and runner.");
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const agency = await signedInContext(browser, admin, "workflow-agency");
  const other = await signedInContext(browser, admin, "workflow-other-agency");
  const owner = await signedInContext(browser, admin, "workflow-owner");
  const headers = { origin: env.app };
  const workspaceIds: string[] = [];
  let tenantId: string | null = null;
  try {
    for (const person of [agency, other, owner]) expect((await person.context.request.get("/api/workspace")).status()).toBe(200);
    for (const [person, name] of [[agency, "Northside Web Care"], [other, "Southtowns Digital"]] as const) {
      const response = await person.context.request.post("/api/workspace", { headers, data: { action: "create_agency", name } });
      expect(response.status(), await response.text()).toBeLessThan(300);
      workspaceIds.push((await response.json() as { workspaceId: string }).workspaceId);
    }
    const agencyId = workspaceIds[0]!;
    const prospectId = randomUUID();
    sql(`insert into public.agency_prospecting_profiles(workspace_id,slug,contact_url,contact_email,enabled) values ('${agencyId}','workflow-${agencyId.slice(0,8)}','https://northside.example/contact','hello@northside.example',true);
      insert into public.prospects(id,agency_workspace_id,source,result_id,name,email,url,business,score,grade) values ('${prospectId}','${agencyId}','audit','workflow-${prospectId}','Dana Ruiz','${owner.email}',null,'Elmwood Bakery',58,'C');`);
    expect(sql(`select count(*) from public.super_admins where user_id in ('${agency.userId}','${other.userId}','${owner.userId}')`)).toBe("0");

    // Agency adds a prospect through the product form, with no website fetch.
    const agencyPage = await agency.context.newPage();
    await agencyPage.setViewportSize({ width: 1440, height: 1000 });
    await agencyPage.goto(`/workspace/agency/clients/new?workspaceId=${agencyId}&prospect=${prospectId}`);
    await agencyPage.getByRole("radio", { name: /Elmwood Bakery/ }).check();
    await expect(agencyPage.getByLabel("Owner’s email")).toHaveValue(owner.email);
    const addedResponse = agencyPage.waitForResponse(r => new URL(r.url()).pathname === "/api/workspace/agency-clients" && r.request().method() === "POST");
    await agencyPage.getByRole("button", { name: "Add client", exact: true }).click();
    const added = await addedResponse;
    expect(added.status(), await added.text()).toBe(201);
    const result = await added.json() as { client: { customerWorkspaceId: string }; ownerClaim: { claimPath: string; delivery: { status: string } } };
    const businessId = result.client.customerWorkspaceId;
    workspaceIds.push(businessId);
    await expect(agencyPage.getByRole("heading", { name: "Elmwood Bakery", exact: true })).toBeVisible();
    await expect(agencyPage.getByText("Not sent.", { exact: true })).toBeVisible();
    expect(result.ownerClaim.delivery.status).toBe("not_sent");
    expect(sql(`select count(*) from public.workspace_memberships where workspace_id='${businessId}'`)).toBe("0");
    expect(sql(`select count(*) from public.provider_seats where customer_workspace_id='${businessId}' and agency_workspace_id='${agencyId}' and status='active'`)).toBe("1");
    await agencyPage.screenshot({ path: testInfo.outputPath("agency-client-added-desktop.png"), fullPage: true });
    await agencyPage.setViewportSize({ width: 390, height: 844 });
    await fits(agencyPage);
    await agencyPage.screenshot({ path: testInfo.outputPath("agency-client-added-390.png"), fullPage: true });

    const claimApi = result.ownerClaim.claimPath.replace("/workspace/claim/", "/api/workspace-claims/");
    expect((await other.context.request.post(claimApi, { headers, data: {} })).status()).toBe(403);
    const claim = await owner.context.newPage();
    await claim.setViewportSize({ width: 390, height: 844 });
    await claim.goto(result.ownerClaim.claimPath);
    await expect(claim.getByRole("heading", { name: "Take ownership of Elmwood Bakery" })).toBeVisible();
    await claim.getByRole("button", { name: "Become the owner", exact: true }).click();
    await expect(claim.getByRole("heading", { name: "Elmwood Bakery is yours.", exact: true })).toBeVisible();
    expect(sql(`select user_id || '|' || role from public.workspace_memberships where workspace_id='${businessId}'`)).toBe(`${owner.userId}|owner`);

    // The confirmed owner names the trusted approval recipient. Merely naming
    // an email while adding a client never confers owner decision authority.
    await claim.goto(`/workspace/business-details?workspaceId=${businessId}`);
    await claim.getByLabel("Send Strelva's emails to", { exact: true }).fill(owner.email);
    await claim.getByRole("button", { name: "Save details", exact: true }).click();
    await expect(claim).toHaveURL(/result=saved/);
    expect(sql(`select public.resolve_business_owner_recipient('${businessId}')->>'email'`)).toBe(owner.email);
    expect(sql(`select public.resolve_business_owner_recipient('${businessId}')->>'trusted'`)).toBe("true");

    // An ordinary staffed seat reaches and creates the private rebuild. No
    // member row is ever added to the client for either agency identity.
    await agencyPage.setViewportSize({ width: 1440, height: 1000 });
    await agencyPage.goto(`/workspace/site?workspaceId=${businessId}&entry=rebuild`);
    await expect(agencyPage.getByText("This business isn't available to your account.")).toHaveCount(0);
    const create = await agency.context.request.post("/api/websites/rebuild", { headers, data: {
      workspaceId: businessId, requestId: `workflow-${randomUUID()}`, businessName: "Elmwood Bakery", description: "We bake sourdough bread for neighborhood pickup every Saturday.",
    } });
    expect(create.status(), await create.text()).toBe(202);
    let record = await create.json() as WebsiteRebuildRecord;
    const workId = record.workId;
    await expect.poll(async () => { record = await read(agency.context.request, workId); return record.rebuild.status; }, { timeout: 120_000 }).toBe("review_ready");
    expect(record.rebuild.candidate?.document.siteName).toBe("Elmwood Bakery");
    expect((await other.context.request.get(`/api/websites/${workId}/rebuild`)).status()).toBe(403);
    expect((await other.context.request.get(record.rebuild.candidate!.previewHref)).status()).toBe(403);
    expect(sql(`select count(*) from public.workspace_memberships where workspace_id='${businessId}' and user_id='${agency.userId}'`)).toBe("0");
    // Description-only facts are honestly unverified until the owner confirms
    // the exact candidate. Each confirmation makes a new immutable revision.
    while (unresolvedSiteFacts(record.rebuild.candidate!.document).length) {
      const factId = unresolvedSiteFacts(record.rebuild.candidate!.document)[0]!;
      const confirmed = await owner.context.request.post(`/api/websites/${workId}/facts/${factId}`, { headers, data: { ...selection(record), action: "confirm" } });
      expect(confirmed.status(), await confirmed.text()).toBe(200);
      record = await confirmed.json();
    }
    expect(Object.values(record.rebuild.candidate!.document.nodes).some(node => node.verification?.needsReview)).toBe(false);
    const needs = await owner.context.request.get(`/api/workspace/needs-you?workspaceId=${businessId}`);
    expect(needs.status(), await needs.text()).toBe(200);
    type Item = { id: string; workspaceId: string; revisionHash: string; sourceLifecycle: string; sourceId: string };
    const approval = (await needs.json() as { items: Item[] }).items.find(item => item.sourceLifecycle === "website_document" && item.sourceId === `${workId}:approve`)!;
    expect(approval).toBeTruthy();
    // The isolated stack never sends email. Record suppression first; a
    // hand-made signed URL correctly grants nothing until delivery is bound.
    const suppressed = await admin.rpc("record_owner_decision_delivery", { p_workspace_id: businessId, p_decision_id: approval.id, p_kind: "digest", p_status: "suppressed", p_recipient: owner.email, p_provider_message_id: null, p_reason: "isolated_local_email_disabled" });
    expect(suppressed.error).toBeNull();
    expect(sql(`select count(*) from public.owner_decision_deliveries where decision_id='${approval.id}' and status='sent'`)).toBe("0");
    const link = (recipient: string) => buildWorkspaceApproveUrl(env.app, { workspaceId: businessId, itemId: approval.id, action: "approve", recipient, revision: approval.revisionHash });
    const anonymous = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      const review = await anonymous.newPage();
      await review.goto(link(owner.email));
      await expect(review.getByRole("button", { name: "Confirm — approve", exact: true })).toBeVisible();
      expect(sql(`select state from public.owner_decisions where id='${approval.id}'`)).toBe("open");
      await review.getByRole("button", { name: "Confirm — approve", exact: true }).click();
      await expect(review.getByRole("heading", { name: "This link isn't for this account", exact: true })).toBeVisible();
      expect(sql(`select state from public.owner_decisions where id='${approval.id}'`)).toBe("open");
      await review.goto(link(other.email));
      await review.getByRole("button", { name: "Confirm — approve", exact: true }).click();
      await expect(review.getByRole("heading", { name: "This link isn't for this account", exact: true })).toBeVisible();
      expect(sql(`select state from public.owner_decisions where id='${approval.id}'`)).toBe("open");
      // Simulate one accepted local test email through the production receipt
      // RPC, which atomically binds the recipient. This proves decision/link
      // authority; it is not proof of email transport or owner notification.
      const delivered = await admin.rpc("record_owner_decision_delivery", { p_workspace_id: businessId, p_decision_id: approval.id, p_kind: "digest", p_status: "sent", p_recipient: owner.email, p_provider_message_id: `fictional-local-${approval.id}`, p_reason: "SIMULATED delivery; no provider called or email sent" });
      expect(delivered.error).toBeNull();
      await review.goto(link(owner.email));
      await review.getByRole("button", { name: "Confirm — approve", exact: true }).click();
      await expect(review.getByRole("heading", { name: "Approved", exact: true })).toBeVisible();
      await fits(review);
      await review.screenshot({ path: testInfo.outputPath("owner-link-approved-390.png"), fullPage: true });
    } finally { await anonymous.close(); }
    record = await read(agency.context.request, workId);
    expect(record.rebuild.status).toBe("approved");
    expect(sql(`select approved_by from public.website_document_heads where website_work_id='${workId}'`)).toBe(owner.userId);
    expect(sql(`select decided_by_kind || '|' || outcome from public.owner_decisions where id='${approval.id}'`)).toBe("owner_link|done");

    // An agency needs both independent publish verification and the owner's
    // resource-specific mandate. Approval alone grants neither.
    const launch = () => agency.context.request.post(`/api/websites/${workId}/launch`, { headers, data: selection(record) });
    expect((await launch()).status()).toBe(403);
    sql(`insert into public.agency_verifications(agency_workspace_id,effect,status,evidence,verified_by,verifier_is_agency_member) values ('${agencyId}','publish','verified','{"fixture":"isolated publish review"}','${owner.userId}',false);`);
    expect((await launch()).status()).toBe(403);
    expect(sql(`select count(*) from public.client_resource_mandates where customer_workspace_id='${businessId}' and agency_workspace_id='${agencyId}' and status='active'`)).toBe("0");
    record = await read(owner.context.request, workId);
    expect(record).toMatchObject({ agencyPublishPermission: { agencyWorkspaceId: agencyId, agencyName: "Northside Web Care", granted: false } });
    await claim.setViewportSize({ width: 1440, height: 1000 });
    await claim.goto(`/workspace/site?workspaceId=${businessId}&entry=rebuild&workId=${workId}`);
    await expect(claim.getByText("This exact preview is approved.", { exact: true })).toBeVisible();
    await claim.screenshot({ path: testInfo.outputPath("owner-publish-permission-before-desktop.png"), fullPage: true });
    await claim.getByRole("checkbox", { name: /^Allow Northside Web Care to publish this website after I approve each change\./ }).check();
    const permissionResponse = claim.waitForResponse(r => new URL(r.url()).pathname === `/api/websites/${workId}/approve` && r.request().method() === "POST");
    await claim.getByRole("button", { name: "Approve preview and allow agency publishing", exact: true }).click();
    const permission = await permissionResponse;
    expect(permission.status(), await permission.text()).toBe(200);
    record = await permission.json();
    expect(sql(`select granted_by_kind || '|' || granted_by from public.client_resource_mandates where customer_workspace_id='${businessId}' and agency_workspace_id='${agencyId}' and status='active'`)).toBe(`owner|${owner.userId}`);
    expect((await other.context.request.post(`/api/websites/${workId}/launch`, { headers, data: selection(record) })).status()).toBe(403);
    const published = await launch();
    expect(published.status(), await published.text()).toBe(200);
    record = await published.json();
    tenantId = record.rebuild.tenantId;
    expect(record.rebuild.status).toBe("published");
    expect(record.rebuild.launch.receipt).toMatchObject({ status: "published", provider: "strelva-hosted", artifactHash: record.rebuild.candidate!.contentHash, candidateRevision: record.rebuild.candidate!.revision });
    // Local publication does not claim DNS or public HTTPS exists. The real
    // public transport records its unconfirmed read-back separately.
    expect(record.rebuild.launch.readBack?.status).toBe("failed");
    const receiptId = record.rebuild.launch.receipt!.receiptId;
    const replay = await launch();
    expect(replay.status(), await replay.text()).toBe(200);
    expect((await replay.json() as WebsiteRebuildRecord).rebuild.launch.receipt!.receiptId).toBe(receiptId);
    expect(sql(`select count(*) from public.website_document_receipts where website_work_id='${workId}'`)).toBe("1");
    expect(sql(`select approved_by from public.website_document_heads where website_work_id='${workId}'`)).toBe(owner.userId);

    // Read the actual published renderer over loopback, independently of the
    // failed public HTTPS check. This verifies the served hash and layout;
    // it does not manufacture a healthy public provider receipt.
    const localSite = new URL(env.app);
    localSite.hostname = `${tenantId}.localhost`;
    const publicContext = await browser.newContext();
    try {
      const publicPage = await publicContext.newPage();
      await publicPage.setViewportSize({ width: 1440, height: 1000 });
      await publicPage.goto(localSite.toString());
      await expect(publicPage.locator('meta[name="strelva-site-hash"]')).toHaveAttribute("content", record.rebuild.candidate!.contentHash);
      await expect(publicPage.getByText("Elmwood Bakery").first()).toBeVisible();
      await publicPage.screenshot({ path: testInfo.outputPath("published-site-loopback-desktop.png"), fullPage: true });
      await publicPage.setViewportSize({ width: 390, height: 844 });
      await fits(publicPage);
      await publicPage.screenshot({ path: testInfo.outputPath("published-site-loopback-390.png"), fullPage: true });
    } finally { await publicContext.close(); }

    // The owner opens the saved website, sees the accepted publication receipt
    // and failed public read-back, and returns to the same result on mobile.
    await claim.setViewportSize({ width: 1440, height: 1000 });
    await claim.goto(`/workspace/site?workspaceId=${businessId}&entry=rebuild&workId=${workId}`);
    await expect(claim.getByText("This revision has been published.", { exact: true })).toBeVisible();
    const publicReadBack = claim.getByText(/Published, but we could not confirm it yet/);
    await expect(claim.getByText("Ask Northside Web Care about domain setup and verification.", { exact: true })).toBeVisible();
    const receipt = claim.getByText(/Published receipt recorded/).first();
    await publicReadBack.scrollIntoViewIfNeeded();
    await expect(publicReadBack).toBeInViewport();
    await receipt.scrollIntoViewIfNeeded();
    await expect(receipt).toBeInViewport();
    await fits(claim);
    await claim.screenshot({ path: testInfo.outputPath("owner-published-receipt-desktop.png"), fullPage: true });
    await claim.setViewportSize({ width: 390, height: 844 });
    await fits(claim);
    const mobileHeading = claim.getByRole("heading", { name: "Elmwood Bakery", exact: true });
    await mobileHeading.scrollIntoViewIfNeeded();
    await expect(mobileHeading).toBeInViewport();
    await claim.screenshot({ path: testInfo.outputPath("owner-published-layout-390.png"), fullPage: true });
    await receipt.scrollIntoViewIfNeeded();
    await expect(receipt).toBeInViewport();
    await claim.screenshot({ path: testInfo.outputPath("owner-published-receipt-390.png"), fullPage: true });
    expect((await owner.context.request.get(`/api/websites/${workId}/history`)).status()).toBe(200);
    expect((await other.context.request.get(`/api/websites/${workId}/history`)).status()).toBe(403);
    expect(sql(`select count(*) from public.super_admins where user_id in ('${agency.userId}','${other.userId}','${owner.userId}')`)).toBe("0");
  } finally {
    for (const id of workspaceIds.reverse()) await admin.from("workspaces").delete().eq("id", id);
    if (tenantId) await admin.from("tenants").delete().eq("id", tenantId);
    for (const person of [agency, other, owner]) { await person.context.close(); await admin.auth.admin.deleteUser(person.userId); }
  }
});
