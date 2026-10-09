import { localSql } from "./support/journeys";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { localEnvironment, signedInContext } from "./support/local-auth";
import { ordinaryAgencyMaker, ordinaryCustomerBusiness } from "./support/ordinary-agency-maker";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires isolated local Supabase Auth and Postgres.");
test.setTimeout(240_000);

type ApplicationPayload = {
  revision: number;
  designRevision: number;
  release?: { version: number } | null;
  spec: Record<string, unknown>;
  history: Array<Record<string, unknown>>;
};
type ApplicationResponse = { id: string; payload: ApplicationPayload };
type ResponsibilityResponse = { id: string; payload: { revision: number } };
type InstallationResponse = { installation: { id: string; revision: number } };
type ServiceRequestResponse = { request: { id: string; revision: number } };
type DeliveryListResponse = { deliveries: Array<{ id: string; installationId: string; assignmentId: string }> };
type GrantResponse = { grant: { id: string; status: string; applicationWorkId: string; operatorUserId: string } };

async function post(
  request: APIRequestContext,
  path: string,
  body: unknown,
  status = 200,
): Promise<Record<string, unknown>> {
  const response = await request.post(path, {
    headers: { origin: localEnvironment().app },
    data: body,
  });
  expect(response.status(), await response.text()).toBe(status);
  return await response.json() as Record<string, unknown>;
}

async function getJson(request: APIRequestContext, path: string, status = 200): Promise<Record<string, unknown>> {
  const response = await request.get(path);
  expect(response.status(), await response.text()).toBe(status);
  return await response.json() as Record<string, unknown>;
}

async function ignore(value: PromiseLike<unknown>): Promise<void> {
  try { await value; } catch { /* Synthetic proof cleanup is best effort. */ }
}

test("a named agency operator revises one assigned application and returns it for customer publication", async ({ browser }, testInfo) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, "agency-authoring-customer");
  const operator = await signedInContext(browser, admin, "agency-authoring-operator");
  const outsider = await signedInContext(browser, admin, "agency-authoring-outsider");
  let businessId = "";
  let agencyId = "";
  let appId = "";
  let deliveryId = "";
  let grantId = "";

  try {
    // Ensure all three Auth identities are mirrored into public.users before
    // the service-role fixture creates workspace and native rows.
    for (const person of [owner, operator, outsider]) {
      expect((await person.context.request.get("/api/workspace")).status()).toBe(200);
    }
    businessId = await ordinaryCustomerBusiness(owner, "Agency authoring customer");
    const selectedAgency = await ordinaryAgencyMaker(browser, admin, owner, businessId, operator);
    agencyId = selectedAgency.agencyId;
    // Ordinary HTTP agency creation, owner-selected provider and current staffing;
    // no customer membership overlay or hand-written provider seats.


    const refused = await post(owner.context.request, "/api/bounded-work", {
      action: "create", productId: "applications", workspaceId: businessId,
      input: { title: "Customer cannot build", fields: [{ id: "request", label: "Request", type: "text", required: true }],
        components: [{ kind: "form", fields: ["request"] }] },
    }, 403);
    expect(refused.code).toBe("make_systems_required");
    let app = await post(operator.context.request, "/api/bounded-work", {
      action: "create",
      productId: "applications",
      workspaceId: businessId,
      input: {
        title: "Agency permit requests",
        fields: [{ id: "request", label: "Request", type: "text", required: true }],
        components: [{ kind: "form", fields: ["request"] }, { kind: "list", fields: ["request"] }, { kind: "detail", fields: ["request"] }],
      },
    }, 201) as unknown as ApplicationResponse;
    appId = app.id;
    const readOnly = localSql<{ allowed: boolean; ids: string[] }>(`begin read only;
      select jsonb_build_object('allowed',public.agency_can_author_created_application(:'v1'::uuid,:'v2'::uuid,:'v3',:'v4'::uuid),
      'ids',public.agency_created_application_work_ids(:'v1'::uuid,:'v2'::uuid,:'v3')); rollback;`, businessId, operator.userId, operator.email, appId);
    expect(readOnly?.allowed).toBe(true);
    expect(readOnly?.ids).toContain(appId);
    await getJson(operator.context.request, `/api/bounded-work?productId=applications&workId=${appId}`);
    await getJson(outsider.context.request, `/api/bounded-work?productId=applications&workId=${appId}`, 403);
    const foreignBusiness = await ordinaryCustomerBusiness(outsider, "Unrelated private customer business");
    const foreignWork = await post(outsider.context.request, "/api/documents", { action: "create", workspaceId: foreignBusiness,
      input: { title: "Foreign private record", text: "The selected creator must not read another business's work" } });
    const crossBusiness = await operator.context.request.get(`/api/bounded-work?productId=applications&workId=${String(foreignWork.workId)}`);
    expect(crossBusiness.status()).toBe(403);
    expect(await crossBusiness.text()).not.toContain("Foreign private record");
    await post(operator.context.request, "/api/bounded-work", {
      action: "command", productId: "applications", workId: appId,
      command: { kind: "publish", expectedCandidateRevision: app.payload.designRevision, expectedReleaseVersion: null },
    }, 403);
    async function staff(active: boolean) {
      const result = await admin.rpc("bulk_set_agency_client_staff", { p_user_id: operator.userId, p_verified_email: operator.email,
        p_agency_workspace_id: agencyId, p_staff_user_ids: [operator.userId], p_workspace_ids: [businessId], p_active: active });
      expect(result.error).toBeNull();
    }
    await staff(false);
    await getJson(operator.context.request, `/api/bounded-work?productId=applications&workId=${appId}`, 403);
    await post(operator.context.request, "/api/bounded-work", { action: "command", productId: "applications", workId: appId,
      command: { kind: "rehearse", expectedRevision: app.payload.revision } }, 403);
    await staff(true);
    app = await post(operator.context.request, "/api/bounded-work", {
      action: "command", productId: "applications", workId: appId,
      command: { kind: "rehearse", expectedRevision: app.payload.revision },
    }) as unknown as ApplicationResponse;
    app = await post(owner.context.request, "/api/bounded-work", {
      action: "command", productId: "applications", workId: appId,
      command: { kind: "publish", expectedCandidateRevision: app.payload.designRevision, expectedReleaseVersion: app.payload.release?.version ?? null },
    }) as unknown as ApplicationResponse;

    const privateRecord = "Customer record stays private after first publication";
    app = await post(owner.context.request, "/api/bounded-work", { action: "command", productId: "applications", workId: appId,
      command: { kind: "submit", expectedReleaseVersion: app.payload.release?.version, expectedRecordsRevision: 0,
        record: { id: "customer-existing-record", values: { request: privateRecord } } } }) as unknown as ApplicationResponse;
    const creatorAfterPublication = await operator.context.request.get(`/api/bounded-work?productId=applications&workId=${appId}`);
    expect(creatorAfterPublication.status()).toBe(403);
    expect(await creatorAfterPublication.text()).not.toContain(privateRecord);
    const publishedReadOnly = localSql<{ allowed: boolean; ids: string[] }>(`begin read only;
      select jsonb_build_object('allowed',public.agency_can_author_created_application(:'v1'::uuid,:'v2'::uuid,:'v3',:'v4'::uuid),
      'ids',public.agency_created_application_work_ids(:'v1'::uuid,:'v2'::uuid,:'v3')); rollback;`, businessId, operator.userId, operator.email, appId);
    expect(publishedReadOnly?.allowed).toBe(false);
    expect(publishedReadOnly?.ids).not.toContain(appId);
    const beforeRecordWrite = await getJson(owner.context.request, `/api/bounded-work?productId=applications&workId=${appId}`);
    await post(operator.context.request, "/api/bounded-work", { action: "command", productId: "applications", workId: appId,
      command: { kind: "submit", expectedReleaseVersion: app.payload.release?.version, expectedRecordsRevision: 1,
        record: { id: "agency-cannot-submit", values: { request: "Denied customer record mutation" } } } }, 403);
    expect(await getJson(owner.context.request, `/api/bounded-work?productId=applications&workId=${appId}`)).toEqual(beforeRecordWrite);

    const responsibility = await post(owner.context.request, "/api/operations", {
      action: "create",
      workspaceId: businessId,
      input: {
        title: "Check the assigned permit app",
        intent: "Run the approved application checks for the exact installed app.",
        steps: [{
          id: "check-app",
          operation: "application.command",
          workId: appId,
          input: { kind: "rehearse", expectedDesignRevision: app.payload.designRevision },
          maximumCents: 0,
          capabilityVersion: 1,
        }],
      },
    }) as unknown as ResponsibilityResponse;
    await post(owner.context.request, "/api/operations", {
      action: "command", workId: responsibility.id,
      command: { kind: "approve", expectedRevision: responsibility.payload.revision },
    });

    const installed = await post(owner.context.request, "/api/offerings", {
      action: "install",
      businessId,
      definitionId: "private_staff_requests",
      definitionVersion: "1.0.0",
      idempotencyKey: `agency-authoring-install:${businessId}`,
      configuration: { displayName: "Agency permit requests" },
      nativeResources: [{ kind: "application", id: appId }],
      responsibility: {
        kind: "provider_requested",
        providerKind: "agency",
        providerName: "Agency authoring studio",
        agencyWorkspaceId: agencyId,
        requestNote: "Named operator may prepare the exact application draft after customer approval.",
      },
      acceptedScope: ["submit_requests", "review_requests"],
      surfaceIds: ["staff_app", "business_workspace"],
    }) as unknown as InstallationResponse;
    const installationId = installed.installation.id as string;
    // Direct native-resource installs are active immediately. The separate
    // activation command belongs to the prepared offering path, which creates
    // a draft installation and its generated application.
    expect((installed.installation as { status?: string }).status).toBe("active");

    const serviceRequest = await post(owner.context.request, "/api/service-requests", {
      action: "save",
      businessId,
      status: "requested",
      request: "Prepare the exact permit request application.",
      outcome: "Return a checked draft for the customer to publish.",
      context: { source: "agency-authoring-proof", test: true },
      scope: ["submit_requests", "review_requests"],
      provider: { kind: "agency", agencyWorkspaceId: agencyId },
      idempotencyKey: `agency-authoring-request:${businessId}`,
    }) as unknown as ServiceRequestResponse;
    await post(operator.context.request, "/api/service-requests", {
      action: "respond",
      requestId: serviceRequest.request.id,
      expectedRevision: serviceRequest.request.revision,
      decision: "accepted",
      note: "Accepted for exact application delivery.",
      idempotencyKey: `agency-authoring-response:${businessId}`,
    });

    const customerPage = await owner.context.newPage();
    customerPage.setDefaultTimeout(20_000);
    await customerPage.setViewportSize({ width: 1280, height: 900 });
    await customerPage.goto(`/workspace?workspaceId=${businessId}&view=help`, { waitUntil: "domcontentloaded" });
    await expect(customerPage.getByRole("heading", { name: "What do you need?", exact: true })).toBeVisible();
    await customerPage.locator("ul button").filter({ hasText: "Accepted for review" }).first().click();
    await customerPage.getByRole("button", { name: "Review delivery options", exact: true }).click();
    await expect(customerPage.getByRole("heading", { name: "Move this request into delivery", exact: true })).toBeVisible();
    await customerPage.getByLabel("Named provider operator email", { exact: true }).fill(operator.email);
    for (const checkbox of await customerPage.getByRole("checkbox").all()) {
      if (!(await checkbox.isChecked())) await checkbox.check();
    }
    await customerPage.getByRole("button", { name: "Create exact provider assignment", exact: true }).click();
    await expect(customerPage.getByText("Provider acceptance is still pending.", { exact: false })).toBeVisible();

    const pendingDeliveries = await getJson(operator.context.request, `/api/offerings/provider-delivery?businessId=${businessId}`) as unknown as DeliveryListResponse;
    const pending = pendingDeliveries.deliveries.find((item: { installationId: string }) => item.installationId === installationId);
    expect(pending).toBeTruthy();
    if (!pending) throw new Error("The provider delivery was not returned for the installed application.");
    deliveryId = pending.id;
    await post(operator.context.request, "/api/offerings/provider-delivery", { action: "accept", deliveryId });
    const executed = await post(operator.context.request, "/api/operational-assignments", { action: "run", assignmentId: pending.assignmentId });
    expect((executed.responsibility as { payload?: { status?: string } }).payload?.status).toBe("completed");

    await customerPage.reload({ waitUntil: "domcontentloaded" });
    await customerPage.locator("ul button").filter({ hasText: "Accepted for review" }).first().click();
    await customerPage.getByRole("button", { name: "Review delivery options", exact: true }).click();
    await expect(customerPage.getByText("Application draft editing", { exact: true })).toBeVisible();

    const agencyPage = await operator.context.newPage();
    agencyPage.setDefaultTimeout(20_000);
    await agencyPage.setViewportSize({ width: 390, height: 844 });
    await agencyPage.goto(`/workspace?workspaceId=${agencyId}`, { waitUntil: "domcontentloaded" });
    // Systems wording only when STRELVA_SYSTEMS_RELEASE is on for the app under test.
    await expect(agencyPage.getByRole("heading", { name: process.env.STRELVA_SYSTEMS_RELEASE === "1" ? "Internal-tool drafts for clients" : "Assigned application drafts", exact: true })).toBeVisible();
    await agencyPage.getByRole("link", { name: "Open draft", exact: true }).click();
    await expect(agencyPage.getByText("The customer has not granted draft editing", { exact: false })).toBeVisible();
    await expect(agencyPage.getByRole("button", { name: "Save new draft", exact: true })).toHaveCount(0);

    await customerPage.getByRole("button", { name: "Grant draft editing to named operator", exact: true }).click();
    await expect(customerPage.getByText("The named agency operator can now revise this exact application draft.", { exact: false })).toBeVisible();
    const grantResponse = await getJson(operator.context.request, `/api/agency-application-draft-access?workId=${appId}`) as unknown as GrantResponse;
    expect(grantResponse.grant).toMatchObject({ status: "active", applicationWorkId: appId, operatorUserId: operator.userId });
    grantId = grantResponse.grant.id;

    await agencyPage.reload({ waitUntil: "domcontentloaded" });
    await expect(agencyPage.getByRole("status").filter({ hasText: "You can revise this exact application draft" })).toBeVisible({ timeout: 20_000 });
    await agencyPage.getByText("Edit proposed app", { exact: true }).click();
    await agencyPage.getByLabel("Label for Request", { exact: true }).fill("Request details");
    const saveDraft = agencyPage.getByRole("button", { name: "Save new draft", exact: true });
    await saveDraft.focus();
    await expect(saveDraft).toBeFocused();
    await saveDraft.press("Enter");
    await expect(agencyPage.getByText(/label changes from "Request" to "Request details"/)).toBeVisible();

    const revised = await getJson(operator.context.request, `/api/bounded-work?productId=applications&workId=${appId}`) as unknown as ApplicationResponse;
    expect(revised.payload.history.at(-1)).toMatchObject({ kind: "revise_candidate", actorId: operator.userId });
    await post(operator.context.request, "/api/bounded-work", {
      action: "command", productId: "applications", workId: appId,
      command: { kind: "revise", expectedDesignRevision: 0, spec: revised.payload.spec },
    }, 409);

    const customerAppPage = await owner.context.newPage();
    customerAppPage.setDefaultTimeout(20_000);
    await customerAppPage.setViewportSize({ width: 1280, height: 900 });
    await customerAppPage.goto(`/workspace?workspaceId=${businessId}&view=applications&work=${appId}`, { waitUntil: "domcontentloaded" });
    await expect(customerAppPage.getByRole("heading", { name: "Agency permit requests", exact: true })).toBeVisible();
    await expect(customerAppPage.getByText('Field changed: "Request details"; label changes from "Request" to "Request details".', { exact: true })).toBeVisible();
    await customerAppPage.getByRole("button", { name: "Check proposed change", exact: true }).click();
    await expect(customerAppPage.getByRole("button", { name: "Publish", exact: true })).toBeEnabled();
    await customerAppPage.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(customerAppPage.getByText(/Version 2 is live/)).toBeVisible();

    // The operator can still inspect the returned live result, but customer
    // publication remains the only release path.
    await agencyPage.reload({ waitUntil: "domcontentloaded" });
    await expect(agencyPage.getByText("Version 2 is live.", { exact: false })).toBeVisible();
    await expect(agencyPage.getByRole("button", { name: "Publish", exact: true })).toHaveCount(0);

    await customerPage.bringToFront();
    await customerPage.getByRole("textbox", { name: "Customer review", exact: true }).fill("Verified the agency receipt and published the returned draft.");
    await customerPage.getByRole("button", { name: "Confirm completed delivery", exact: true }).click();
    await expect(customerPage.getByText("The completed delivery is confirmed and linked to this request.", { exact: true })).toBeVisible();

    // A separate account never obtains assigned read or draft-write access,
    // and a delivery confirmation closes the grant target on the next write.
    await getJson(outsider.context.request, `/api/bounded-work?productId=applications&workId=${appId}`, 403);
    await post(outsider.context.request, "/api/bounded-work", {
      action: "command", productId: "applications", workId: appId,
      command: { kind: "revise", expectedDesignRevision: revised.payload.designRevision, spec: revised.payload.spec },
    }, 403);
    await post(owner.context.request, "/api/agency-application-draft-access", { action: "revoke", grantId });
    await post(operator.context.request, "/api/bounded-work", {
      action: "command", productId: "applications", workId: appId,
      command: { kind: "revise", expectedDesignRevision: revised.payload.designRevision, spec: revised.payload.spec },
    }, 403);

    await agencyPage.reload({ waitUntil: "domcontentloaded" });
    await expect(agencyPage.getByText("The customer has not granted draft editing", { exact: false })).toBeVisible({ timeout: 20_000 });
    await expect(agencyPage.getByRole("button", { name: "Save new draft", exact: true })).toHaveCount(0);

    await customerPage.reload({ waitUntil: "domcontentloaded" });
    await customerPage.getByRole("button", { name: /Prepare the exact permit request application/ }).click();
    await customerPage.getByRole("button", { name: "Review delivery options", exact: true }).click();
    await expect(customerPage.getByText("Application draft editing", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(customerPage.getByRole("button", { name: "Grant draft editing to named operator", exact: true })).toBeVisible();
    await expect(customerPage.getByRole("button", { name: "Revoke draft editing", exact: true })).toHaveCount(0);
    await customerPage.getByText("Application draft editing", { exact: true }).scrollIntoViewIfNeeded();

    await customerPage.screenshot({ path: testInfo.outputPath("agency-authoring-customer-desktop.png"), fullPage: true });
    await agencyPage.screenshot({ path: testInfo.outputPath("agency-authoring-operator-mobile.png"), fullPage: true });
    await customerAppPage.close();
    await agencyPage.close();
    await customerPage.close();
  } finally {
    // Keep the local proof bounded to its synthetic work. Child rows are
    // removed before their workspace parents because provider delivery and
    // assignment history intentionally use restrictive foreign keys.
    await ignore(admin.from("agency_application_draft_grants").delete().eq("business_workspace_id", businessId));
    await ignore(admin.from("offering_provider_deliveries").delete().eq("business_workspace_id", businessId));
    await ignore(admin.from("operational_assignments").delete().eq("workspace_id", businessId));
    await ignore(admin.from("offering_installations").delete().eq("business_workspace_id", businessId));
    await ignore(admin.from("saved_product_work").delete().eq("workspace_id", businessId));
    await ignore(admin.from("workspace_memberships").delete().in("workspace_id", [businessId, agencyId]));
    await ignore(admin.from("workspaces").delete().in("id", [businessId, agencyId]));
    await owner.context.close().catch(() => {});
    await operator.context.close().catch(() => {});
    await outsider.context.close().catch(() => {});
    await admin.auth.admin.deleteUser(owner.userId).catch(() => {});
    await admin.auth.admin.deleteUser(operator.userId).catch(() => {});
    await admin.auth.admin.deleteUser(outsider.userId).catch(() => {});
  }
});
