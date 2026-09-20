import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { localEnvironment, signedInContext } from "./support/local-auth";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires isolated local Supabase Auth and Postgres.");
test.setTimeout(240_000);

type LocalIdentity = Awaited<ReturnType<typeof signedInContext>>;

const hero = {
  headline: "A clear starting point",
  subheadline: "A website customers can understand and use.",
  tagline: "Built for the next conversation.",
  ctaText: "Get in touch",
  ctaLink: "/contact",
  backgroundImageUrl: "",
};

async function post(request: APIRequestContext, path: string, body: unknown, status = 200): Promise<Record<string, unknown>> {
  const response = await request.post(path, {
    headers: { origin: localEnvironment().app },
    data: body,
  });
  const text = await response.text();
  expect(response.status(), text).toBe(status);
  return (text ? JSON.parse(text) : {}) as Record<string, unknown>;
}

async function getJson(request: APIRequestContext, path: string, status = 200): Promise<Record<string, unknown>> {
  const response = await request.get(path);
  const text = await response.text();
  expect(response.status(), text).toBe(status);
  return (text ? JSON.parse(text) : {}) as Record<string, unknown>;
}

async function closeContext(value: BrowserContext | Page | undefined): Promise<void> {
  await value?.close().catch(() => {});
}

async function ignore(value: PromiseLike<unknown>): Promise<void> {
  try { await value; } catch { /* Synthetic proof cleanup is best effort. */ }
}

async function cleanup(admin: SupabaseClient, businessId: string, agencyId: string, tenantId: string, identities: readonly LocalIdentity[]): Promise<void> {
  for (const table of [
    "agency_managed_website_draft_preparations",
    "agency_managed_website_draft_revisions",
    "agency_managed_website_draft_grants",
    "offering_provider_deliveries",
    "operational_assignments",
    "service_request_commands",
    "service_requests",
    "offering_installations",
    "saved_product_work",
    "offering_website_bindings",
    "workspace_memberships",
    "memberships",
    "content",
    "draft_content",
  ]) {
    await ignore(admin.from(table).delete().eq("business_workspace_id", businessId));
    await ignore(admin.from(table).delete().eq("workspace_id", businessId));
    await ignore(admin.from(table).delete().eq("workspace_id", agencyId));
    await ignore(admin.from(table).delete().eq("tenant_id", tenantId));
  }
  await ignore(admin.from("workspaces").delete().in("id", [businessId, agencyId]));
  await ignore(admin.from("tenants").delete().eq("id", tenantId));
  for (const identity of identities) await admin.auth.admin.deleteUser(identity.userId).catch(() => {});
}

test("customer grants one managed website draft, agency prepares it, and customer publishes then revokes", async ({ browser }, testInfo) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, "agency-website-customer");
  const operator = await signedInContext(browser, admin, "agency-website-operator");
  const outsider = await signedInContext(browser, admin, "agency-website-outsider");
  const businessId = randomUUID();
  const agencyId = randomUUID();
  const tenantId = `agency-website-proof-${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const tenantStableId = randomUUID();
  let bindingId = "";
  let installationId = "";
  let responsibilityId = "";
  let requestId = "";
  let deliveryId = "";
  let customerEditorHref = "";
  let customerPage: Page | undefined;
  let agencyPage: Page | undefined;
  let customerWebsitePage: Page | undefined;

  try {
    // The workspace endpoint mirrors each real Auth identity into public.users
    // before the service-role fixture creates its durable workspace rows.
    for (const identity of [owner, operator, outsider]) {
      expect((await identity.context.request.get("/api/workspace")).status()).toBe(200);
    }
    expect((await admin.from("workspaces").insert([
      { id: businessId, kind: "customer", name: "Website draft customer", created_by: owner.userId },
      { id: agencyId, kind: "agency", name: "Website draft agency", created_by: operator.userId },
    ])).error).toBeNull();
    expect((await admin.from("workspace_memberships").insert([
      { workspace_id: businessId, user_id: owner.userId, role: "owner", created_by: owner.userId },
      { workspace_id: agencyId, user_id: operator.userId, role: "owner", created_by: operator.userId },
    ])).error).toBeNull();
    expect((await admin.from("tenants").insert({
      id: tenantId,
      stable_id: tenantStableId,
      site_name: "Website draft customer",
      template: "wellness",
      owner_name: "Website owner",
      owner_email: owner.email,
      active: true,
      subscription_status: "active",
      site_url: "https://website-draft-proof.example",
    })).error).toBeNull();
    expect((await admin.from("memberships").insert({
      user_id: owner.userId,
      tenant_id: tenantId,
      role: "owner",
    })).error).toBeNull();
    expect((await admin.from("content").insert({ tenant_id: tenantId, section: "hero", data: hero })).error).toBeNull();

    const binding = await post(owner.context.request, "/api/offerings/websites", {
      action: "bind_managed_website",
      businessId,
      tenantId,
      idempotencyKey: `agency-website-binding:${businessId}`,
    });
    bindingId = String((binding.websiteBinding as { id: string }).id);

    const responsibility = await post(owner.context.request, "/api/operations", {
      action: "create",
      workspaceId: businessId,
      input: {
        title: "Prepare the managed website draft",
        intent: "Return one native website draft section for the customer to review.",
        steps: [{
          id: "website-draft",
          operation: "website.draft",
          workId: bindingId,
          input: { kind: "draft", bindingId, section: "hero" },
          maximumCents: 0,
          capabilityVersion: 1,
        }],
      },
    });
    responsibilityId = String(responsibility.id);
    await post(owner.context.request, "/api/operations", {
      action: "command",
      workId: responsibilityId,
      command: { kind: "approve", expectedRevision: Number((responsibility.payload as { revision: number }).revision) },
    });

    const installed = await post(owner.context.request, "/api/offerings", {
      action: "install",
      businessId,
      definitionId: "managed_website_changes",
      definitionVersion: "1.0.0",
      idempotencyKey: `agency-website-install:${businessId}`,
      configuration: {},
      nativeResources: [{ kind: "managed_website", id: bindingId }],
      responsibility: {
        kind: "provider_requested",
        providerKind: "agency",
        providerName: "Website draft agency",
        agencyWorkspaceId: agencyId,
        requestNote: "The named agency operator may prepare one hero draft for customer review.",
      },
      acceptedScope: ["request_changes"],
      surfaceIds: ["managed_website"],
    });
    installationId = String((installed.installation as { id: string }).id);

    const serviceRequest = await post(owner.context.request, "/api/service-requests", {
      action: "save",
      businessId,
      status: "requested",
      request: "Prepare one exact managed website hero draft.",
      outcome: "Return a native website revision for customer review.",
      context: { source: "agency-website-authoring-proof", test: true },
      scope: ["request_changes"],
      provider: { kind: "agency", agencyWorkspaceId: agencyId },
      idempotencyKey: `agency-website-request:${businessId}`,
    });
    requestId = String((serviceRequest.request as { id: string }).id);
    await post(operator.context.request, "/api/service-requests", {
      action: "respond",
      requestId,
      expectedRevision: Number((serviceRequest.request as { revision: number }).revision),
      decision: "accepted",
      note: "Accepted for the exact managed website hero draft.",
      idempotencyKey: `agency-website-response:${businessId}`,
    });

    customerPage = await owner.context.newPage();
    customerPage.setDefaultTimeout(25_000);
    await customerPage.setViewportSize({ width: 1280, height: 900 });
    await customerPage.goto(`/workspace?workspaceId=${businessId}&view=help`, { waitUntil: "domcontentloaded" });
    await expect(customerPage.getByRole("heading", { name: "What do you need?", exact: true })).toBeVisible();
    await customerPage.getByRole("button", { name: /Accepted for review/ }).first().click();
    await customerPage.getByRole("button", { name: "Review delivery options", exact: true }).click();
    await expect(customerPage.getByRole("heading", { name: "Move this request into delivery", exact: true })).toBeVisible();
    await customerPage.getByLabel("Named provider operator email", { exact: true }).fill(operator.email);
    for (const checkbox of await customerPage.getByRole("checkbox").all()) {
      if (!(await checkbox.isChecked())) await checkbox.check();
    }
    await customerPage.getByRole("button", { name: "Create exact provider assignment", exact: true }).click();
    await expect(customerPage.getByText("Provider acceptance is still pending.", { exact: false })).toBeVisible();

    const deliveries = await getJson(operator.context.request, `/api/offerings/provider-delivery?businessId=${businessId}`);
    const pending = (deliveries.deliveries as Array<{ id: string; installationId: string; assignmentId: string }>).find((item) => item.installationId === installationId);
    expect(pending).toBeTruthy();
    if (!pending) throw new Error("The website delivery was not returned to the named agency.");
    deliveryId = pending.id;
    await post(operator.context.request, "/api/offerings/provider-delivery", { action: "accept", deliveryId });

    agencyPage = await operator.context.newPage();
    agencyPage.setDefaultTimeout(25_000);
    await agencyPage.setViewportSize({ width: 390, height: 844 });
    await agencyPage.goto(`/workspace?workspaceId=${agencyId}`, { waitUntil: "domcontentloaded" });
    await expect(agencyPage.getByRole("heading", { name: "Assigned website drafts", exact: true })).toBeVisible();
    await expect(agencyPage.getByRole("link", { name: "Open website", exact: true })).toBeVisible();
    await agencyPage.getByRole("link", { name: "Open website", exact: true }).click();
    await expect(agencyPage.getByText("The customer needs to enable draft editing", { exact: false })).toBeVisible();
    await agencyPage.screenshot({ path: testInfo.outputPath("agency-website-before-grant-mobile.png"), fullPage: true });

    await customerPage.goto(`/workspace?workspaceId=${businessId}&view=help`, { waitUntil: "domcontentloaded" });
    await customerPage.getByRole("button", { name: /Accepted for review/ }).first().click();
    await customerPage.getByRole("button", { name: "Review delivery options", exact: true }).click();
    await expect(customerPage.getByRole("heading", { name: "Agency website preparation", exact: true })).toBeVisible();
    await customerPage.getByRole("button", { name: "Grant draft preparation", exact: true }).click();
    await expect(customerPage.getByText("Draft preparation is enabled for the named operator.", { exact: false })).toBeVisible({ timeout: 30_000 });
    customerEditorHref = await customerPage.getByRole("link", { name: "Review and publish in website editor", exact: true }).getAttribute("href") ?? "";
    expect(customerEditorHref).toContain(`/client/${tenantId}/dashboard/site`);
    await customerPage.screenshot({ path: testInfo.outputPath("customer-website-grant-desktop.png"), fullPage: true });

    await agencyPage.goto(`/workspace?workspaceId=${agencyId}`, { waitUntil: "domcontentloaded" });
    await agencyPage.getByRole("link", { name: "Open website", exact: true }).click();
    await expect(agencyPage.getByRole("heading", { name: "Prepare a website update", exact: true })).toBeVisible();
    const preparedHeadline = `Prepared by the named agency ${randomUUID().slice(0, 8)}`;
    await agencyPage.getByLabel("Headline", { exact: true }).fill(preparedHeadline);
    const prepareButton = agencyPage.getByRole("button", { name: "Prepare and save draft", exact: true });
    await prepareButton.focus();
    await expect(prepareButton).toBeFocused();
    await prepareButton.press("Enter");
    await expect(agencyPage.getByText(/Saved hero draft revision 1/)).toBeVisible({ timeout: 30_000 });
    await expect(agencyPage.getByText(/The customer reviews and publishes your draft\./)).toBeVisible();
    await agencyPage.screenshot({ path: testInfo.outputPath("agency-website-prepared-mobile.png"), fullPage: true });

    customerWebsitePage = await owner.context.newPage();
    customerWebsitePage.setDefaultTimeout(25_000);
    await customerWebsitePage.setViewportSize({ width: 1280, height: 900 });
    await customerWebsitePage.goto(customerEditorHref, { waitUntil: "domcontentloaded" });
    await expect(customerWebsitePage.getByRole("button", { name: "Edit site", exact: true })).toBeVisible();
    await customerWebsitePage.getByRole("button", { name: "Edit site", exact: true }).click();
    await expect(customerWebsitePage.getByLabel("Headline", { exact: true }).first()).toHaveValue(preparedHeadline);
    await customerWebsitePage.screenshot({ path: testInfo.outputPath("customer-website-review-desktop.png"), fullPage: true });
    const publish = customerWebsitePage.getByRole("button", { name: /^(Publish live|Save changes)$/ }).last();
    await expect(publish).toBeEnabled();
    await publish.click();
    await expect.poll(async () => {
      const published = await admin.from("content").select("data").eq("tenant_id", tenantId).eq("section", "hero").single();
      return published.data?.data && typeof published.data.data === "object" && !Array.isArray(published.data.data)
        ? (published.data.data as { headline?: string }).headline ?? null
        : null;
    }, { timeout: 30_000 }).toBe(preparedHeadline);

    await customerPage.goto(`/workspace?workspaceId=${businessId}&view=help`, { waitUntil: "domcontentloaded" });
    await customerPage.getByRole("button", { name: /Accepted for review/ }).first().click();
    await customerPage.getByRole("button", { name: "Review delivery options", exact: true }).click();
    await customerPage.getByRole("textbox", { name: "Customer review", exact: true }).fill("Reviewed and published the returned website draft.");
    await customerPage.getByRole("button", { name: "Confirm completed delivery", exact: true }).click();
    await expect(customerPage.getByText("The completed delivery is confirmed and linked to this request.", { exact: true })).toBeVisible();
    await customerPage.getByRole("button", { name: "Revoke draft preparation", exact: true }).click();
    await expect(customerPage.getByText("Draft preparation is revoked", { exact: false })).toBeVisible();

    await agencyPage.goto(`/agency-websites/${bindingId}`, { waitUntil: "domcontentloaded" });
    await expect(agencyPage.getByText("The customer needs to enable draft editing", { exact: false })).toBeVisible();
    await expect(agencyPage.getByRole("button", { name: "Prepare and save draft", exact: true })).toHaveCount(0);
    await post(operator.context.request, "/api/agency-website-draft-access", {
      action: "prepare",
      assignmentId: pending.assignmentId,
      bindingId,
      section: "hero",
      data: { ...hero, headline: "Denied after revocation" },
      expectedRevision: 1,
      expectedHash: "00000000000000000000000000000000",
    }, 403);
    await post(outsider.context.request, "/api/agency-website-draft-access", {
      action: "prepare",
      assignmentId: pending.assignmentId,
      bindingId,
      section: "hero",
      data: hero,
      expectedRevision: 1,
      expectedHash: "00000000000000000000000000000000",
    }, 403);
  } finally {
    await closeContext(customerPage);
    await closeContext(agencyPage);
    await closeContext(customerWebsitePage);
    await cleanup(admin, businessId, agencyId, tenantId, [owner, operator, outsider]);
  }
});
