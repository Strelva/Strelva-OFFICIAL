import { grantOrdinaryAgencyAppDraft } from "./support/ordinary-agency-app-draft";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { localEnvironment, signedInContext } from "./support/local-auth";
import { ordinaryAgencyMaker, ordinaryCustomerBusiness } from "./support/ordinary-agency-maker";

test.skip(
  process.env.STRELVA_LOCAL_AUTH_PROOF !== "1" || process.env.STRELVA_APPLICATION_USE_JOURNEY !== "1",
  "Requires the isolated local Auth stack and the explicit application-use journey flag.",
);
test.setTimeout(180_000);

async function post(request: APIRequestContext, path: string, body: unknown, status = 200) {
  const response = await request.post(path, {
    headers: { origin: localEnvironment().app, "sec-fetch-site": "same-origin" },
    data: body,
  });
  expect(response.status(), await response.text()).toBe(status);
  return response.json();
}

async function applicationCommand(request: APIRequestContext, workId: string, command: unknown) {
  return post(request, "/api/bounded-work", { action: "command", productId: "applications", workId, command });
}

async function readUse(request: APIRequestContext, workId: string, status = 200) {
  const response = await request.get(`/api/apps/${workId}`);
  expect(response.status(), await response.text()).toBe(status);
  return status === 200 ? response.json() : null;
}

async function failOnce(page: Page, workId: string) {
  let failed = false;
  await page.route(`**/api/apps/${workId}`, async route => {
    if (!failed && route.request().method() === "POST") {
      failed = true;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Local proof interruption." }) });
      return;
    }
    await route.continue();
  });
  return () => page.unroute(`**/api/apps/${workId}`);
}

test("a verified staff recipient uses one released version while a candidate changes, then survives rollback and revocation", async ({ browser }, testInfo) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, "application-owner");
  const staff = await signedInContext(browser, admin, "application-staff");
  let maker: Awaited<ReturnType<typeof ordinaryAgencyMaker>> | undefined;
  let primaryFailure: unknown;
  try {
    const workspaceId = await ordinaryCustomerBusiness(owner, "Local agency-built tool customer");
    const refused = await post(owner.context.request, "/api/bounded-work", { action: "create", productId: "applications", workspaceId,
      input: { title: "Customer cannot build", fields: [{ id: "request", label: "Request", type: "text", required: true }], components: [{ kind: "form", fields: ["request"] }] } }, 403);
    expect(refused.code).toBe("make_systems_required");
    maker = await ordinaryAgencyMaker(browser, admin, owner, workspaceId);

    let app = await post(maker.context.request, "/api/bounded-work", {
      action: "create",
      productId: "applications",
      workspaceId,
      input: {
        title: "Repair requests",
        fields: [
          { id: "problem", label: "Problem", type: "text", required: true },
          { id: "priority", label: "Priority", type: "select", required: true, options: ["standard", "urgent"] },
        ],
        components: [{ kind: "form", fields: ["problem", "priority"] }, { kind: "list", fields: ["problem", "priority"] }],
      },
    }, 201);
    app = await applicationCommand(maker.context.request, app.id, { kind: "rehearse", expectedRevision: app.payload.revision });
    app = await applicationCommand(owner.context.request, app.id, { kind: "install", expectedRevision: app.payload.revision });
    await grantOrdinaryAgencyAppDraft(owner, maker, workspaceId, app);

    // Issue and copy the stable link from the owner application surface. The
    // recipient never receives a workspace membership or an owner dashboard.
    await owner.context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: env.app });
    const ownerPage = await owner.context.newPage();
    await ownerPage.goto(`/workspace?workspaceId=${workspaceId}&work=${app.id}`);
    await expect(ownerPage.getByRole("heading", { name: "Repair requests", exact: true })).toBeVisible();
    await ownerPage.getByRole("tab", { name: "Sharing", exact: true }).click();
    await expect(ownerPage.getByRole("heading", { name: "Give someone a link", exact: true })).toBeVisible();
    await ownerPage.getByLabel("Recipient email", { exact: true }).fill(staff.email);
    await ownerPage.getByRole("button", { name: "Issue access link", exact: true }).click();
    await expect(ownerPage.getByText(`Link for ${staff.email}`, { exact: true })).toBeVisible();
    await expect(ownerPage.locator(`a[href="/apps/${app.id}"]`)).toHaveCount(1);
    await ownerPage.getByRole("button", { name: "Copy link", exact: true }).click();
    await expect(ownerPage.getByRole("button", { name: "Copied", exact: true })).toBeVisible();
    await ownerPage.close();

    // The recipient has a personal workspace but is not a member of the
    // owner's workspace. The focused link is the only application authority.
    expect((await staff.context.request.get(`/api/bounded-work?productId=applications&workId=${app.id}`)).status()).toBe(403);
    const page = await staff.context.newPage();
    const apiPaths: string[] = [];
    page.on("request", request => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith("/api/")) apiPaths.push(path);
    });
    await page.goto(`/apps/${app.id}`);
    await expect(page.getByRole("heading", { name: "Repair requests", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Submit a record", exact: true })).toBeVisible();
    await expect(page.getByText(/candidate|rehearsal|maintenance owner|workspace history/i)).toHaveCount(0);

    // A failed request leaves the current draft in memory so the same native
    // submit can be retried without asking the staff member to retype it.
    const recover = await failOnce(page, app.id);
    await page.getByLabel("Problem", { exact: true }).fill("Leaking tap in upstairs bathroom");
    await page.getByRole("combobox", { name: /Priority/ }).selectOption("standard");
    await page.getByRole("button", { name: "Submit record", exact: true }).click();
    await expect(page.locator('[id$="application-submit-error"]')).toContainText("current draft is still here");
    await recover();
    await expect(page.getByLabel("Problem", { exact: true })).toHaveValue("Leaking tap in upstairs bathroom");

    await page.getByRole("button", { name: "Submit record", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Record submitted.");
    let use = await readUse(staff.context.request, app.id);
    expect(use.releaseVersion).toBe(1);
    expect(use.records).toEqual([{ id: expect.any(String), values: { problem: "Leaking tap in upstairs bathroom", priority: "standard" } }]);
    await page.screenshot({ path: testInfo.outputPath("application-use-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("application-use-mobile.png"), fullPage: true });

    // Add the next fields and view through the named maker editor. The live app
    // remains unchanged until the separate review and Publish action below.
    const makerEditPage = await maker.context.newPage();
    await makerEditPage.goto(`/agency-applications/${app.id}`);
    await makerEditPage.getByRole("tab", { name: "Edit", exact: true }).click();
    await makerEditPage.getByText("Edit proposed app", { exact: true }).click();
    await makerEditPage.getByRole("button", { name: "Add field", exact: true }).click();
    await makerEditPage.getByLabel("Label for New field 3", { exact: true }).fill("Equipment location");
    await makerEditPage.getByRole("button", { name: "Add field", exact: true }).click();
    await makerEditPage.getByLabel("Label for New field 4", { exact: true }).fill("Internal note");
    await makerEditPage.getByRole("button", { name: "Add option", exact: true }).click();
    await makerEditPage.getByLabel("Option 3 for Priority", { exact: true }).fill("vip");
    await makerEditPage.getByLabel("Show Equipment location in form view", { exact: true }).check();
    await makerEditPage.getByLabel("Show Equipment location in list view", { exact: true }).check();
    await makerEditPage.getByLabel("View to add", { exact: true }).selectOption("detail");
    await makerEditPage.getByRole("button", { name: "Add view", exact: true }).click();
    await makerEditPage.getByLabel("Show Internal note in detail view", { exact: true }).check();
    let failedEdit = false;
    await makerEditPage.route("**/api/bounded-work", async route => {
      if (!failedEdit && route.request().method() === "POST") {
        failedEdit = true;
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Owner edit interruption." }) });
        return;
      }
      await route.continue();
    });
    await makerEditPage.getByRole("button", { name: "Save new draft", exact: true }).click();
    await expect(makerEditPage.getByText("Owner edit interruption.", { exact: true })).toBeVisible();
    await expect(makerEditPage.getByLabel("Label for Equipment location", { exact: true })).toHaveValue("Equipment location");
    await makerEditPage.unroute("**/api/bounded-work");
    await makerEditPage.getByRole("button", { name: "Save new draft", exact: true }).click();
    await expect(makerEditPage.getByText('Field added: "Equipment location" (text, optional).', { exact: true })).toBeVisible();
    await expect(makerEditPage.getByText('Field added: "Internal note" (text, optional).', { exact: true })).toBeVisible();
    await expect(makerEditPage.getByText('Field changed: "Priority"; options change from standard, urgent to standard, urgent, vip.', { exact: true })).toBeVisible();
    await makerEditPage.close();

    // The owner continues using the published form while the candidate is a
    // draft. The live form has no candidate-only field yet.
    const ownerUsePage = await owner.context.newPage();
    await ownerUsePage.goto(`/workspace?workspaceId=${workspaceId}&work=${app.id}`);
    await expect(ownerUsePage.getByText(/Version 1 is live\..*live use continues/i)).toBeVisible();
    await expect(ownerUsePage.getByRole("tabpanel", { name: "Use", exact: true }).getByLabel("Internal note", { exact: true })).toHaveCount(0);
    await ownerUsePage.getByText("Add another record", { exact: true }).click();
    await ownerUsePage.getByRole("tabpanel", { name: "Use", exact: true }).getByLabel("Problem", { exact: true }).fill("Broken stopcock in utility room");
    await ownerUsePage.getByRole("tabpanel", { name: "Use", exact: true }).getByRole("combobox", { name: /Priority/ }).selectOption("standard");
    await ownerUsePage.getByRole("button", { name: "Save record", exact: true }).click();
    await expect(ownerUsePage.getByRole("status")).toContainText("Saved in this workspace.");
    const ownerUseResult = await owner.context.request.get(`/api/bounded-work?productId=applications&workId=${app.id}`);
    expect(ownerUseResult.status(), await ownerUseResult.text()).toBe(200);
    const ownerUsePayload = await ownerUseResult.json();
    expect(ownerUsePayload.payload.records.some((record: { values?: { problem?: string } }) => record.values?.problem === "Broken stopcock in utility room")).toBe(true);
    await ownerUsePage.close();

    // The candidate is being edited while the recipient keeps using v1.
    use = await readUse(staff.context.request, app.id);
    expect(use.releaseVersion).toBe(1);
    expect(use.records).toHaveLength(1);

    // Review and publish through the owner application surface. The exact
    // review remains beside the live app, and the staff link stays on v1 until
    // the owner publishes this checked proposal.
    const makerChecksPage = await maker.context.newPage();
    await makerChecksPage.goto(`/agency-applications/${app.id}`);
    const makerChecks = makerChecksPage.locator("details").filter({ has: makerChecksPage.locator("summary").filter({ hasText: /^Review changes$/ }) });
    if (!await makerChecks.evaluate(element => (element as HTMLDetailsElement).open)) await makerChecks.locator("summary").click();
    await expect(makerChecks.getByText("Not checked yet. Check this proposal to verify existing records.", { exact: true })).toBeVisible();
    await makerChecks.getByRole("button", { name: "Check proposed change", exact: true }).click();
    await expect(makerChecks.getByText("Passed: Existing records fit this version", { exact: true })).toBeVisible();
    await expect(makerChecks.getByRole("button", { name: "Publish", exact: true })).toHaveCount(0);
    await makerChecksPage.close();
    const makerReviewPage = await owner.context.newPage();
    await makerReviewPage.goto(`/workspace?workspaceId=${workspaceId}&work=${app.id}`);
    await makerReviewPage.getByRole("tab", { name: "Review", exact: true }).click();
    const review = makerReviewPage.locator("details").filter({ has: makerReviewPage.locator("summary").filter({ hasText: /^Review changes$/ }) });
    if (!await review.evaluate(element => (element as HTMLDetailsElement).open)) await review.locator("summary").click();
    await expect(review).toBeVisible();
    await expect(review.getByText('Field added: "Internal note" (text, optional).', { exact: true })).toBeVisible();
    await expect(review.getByText('Field changed: "Priority"; options change from standard, urgent to standard, urgent, vip.', { exact: true })).toBeVisible();
    await expect(review.getByText('View added: detail showing "Problem", "Internal note".', { exact: true })).toBeVisible();
    await expect(review.getByRole("button", { name: "Check proposed change", exact: true })).toHaveCount(0);
    await expect(review.getByText("Checks for proposed version 2", { exact: true })).toBeVisible();
    await expect(review.getByText("Passed: Existing records fit this version", { exact: true })).toBeVisible();
    await expect(review.getByText(/Record compatibility check passed for this proposal/)).toBeVisible();
    await makerReviewPage.screenshot({ path: testInfo.outputPath("application-review-desktop.png"), fullPage: true });
    await makerReviewPage.setViewportSize({ width: 390, height: 844 });
    // Reload at the target viewport and prove the customer-visible contract:
    // the rail is hidden, the review uses the viewport, and the drawer can be
    // opened and closed without displacing the work.
    await makerReviewPage.reload({ waitUntil: "domcontentloaded" });
    await makerReviewPage.getByRole("tab", { name: "Review", exact: true }).click();
    await expect(makerReviewPage.getByText("Review changes", { exact: true })).toBeVisible();
    if (!await review.evaluate(element => (element as HTMLDetailsElement).open)) await review.locator("summary").click();
    const mobileNavigation = makerReviewPage.getByRole("dialog", { name: "Strelva workspace navigation", exact: true });
    await expect(mobileNavigation).not.toBeVisible();
    const reviewMainBox = await makerReviewPage.locator("main[data-frame-main]").boundingBox();
    expect(reviewMainBox?.x ?? -1).toBeLessThan(2);
    expect(reviewMainBox?.width ?? 0).toBeGreaterThan(300);
    expect(await makerReviewPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await makerReviewPage.getByRole("button", { name: "Open navigation", exact: true }).click();
    await expect(mobileNavigation).toBeVisible();
    await mobileNavigation.getByRole("button", { name: "Close navigation", exact: true }).click();
    await expect(mobileNavigation).not.toBeVisible();
    await review.getByRole("button", { name: "Publish", exact: true }).scrollIntoViewIfNeeded();
    await makerReviewPage.screenshot({ path: testInfo.outputPath("application-review-mobile.png"), fullPage: true });
    await makerReviewPage.setViewportSize({ width: 1440, height: 1000 });
    await expect(review.getByRole("button", { name: "Publish", exact: true })).toBeEnabled();
    await review.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(makerReviewPage.getByText(/Version 2 is live/)).toBeVisible();
    await expect(makerReviewPage.getByText("Review changes", { exact: true })).toHaveCount(0);
    const publishedOwnerResult = await owner.context.request.get(`/api/bounded-work?productId=applications&workId=${app.id}`);
    expect(publishedOwnerResult.status(), await publishedOwnerResult.text()).toBe(200);
    app = await publishedOwnerResult.json();
    await makerReviewPage.close();
    await page.reload({ waitUntil: "domcontentloaded" });
    const priority = page.getByRole("combobox", { name: /Priority/ });
    await expect(priority).toBeVisible();
    await priority.selectOption("urgent");
    await page.getByLabel("Problem", { exact: true }).fill("Replacement pipe cutter for van 3");
    await page.getByRole("button", { name: "Submit record", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Record submitted.");
    use = await readUse(staff.context.request, app.id);
    expect(use.releaseVersion).toBe(2);
    expect(use.records).toHaveLength(2);
    expect(use.records[1]?.values).toMatchObject({ problem: "Replacement pipe cutter for van 3", priority: "urgent" });

    // Removing a used choice creates a candidate, but the real rehearsal must
    // fail before Publish can change the live release.
    const makerRemovalPage = await maker.context.newPage();
    await makerRemovalPage.goto(`/agency-applications/${app.id}`);
    await makerRemovalPage.getByRole("tab", { name: "Edit", exact: true }).click();
    await makerRemovalPage.getByText("Edit proposed app", { exact: true }).click();
    await makerRemovalPage.getByLabel("Option 1 for Priority", { exact: true }).fill("normal");
    await makerRemovalPage.getByRole("button", { name: "Save new draft", exact: true }).click();
    const removalReview = makerRemovalPage.locator("details").filter({ hasText: "Review changes" });
    await expect(removalReview.getByText('Field changed: "Priority"; options change from standard, urgent, vip to normal, urgent, vip.', { exact: true })).toBeVisible();
    await removalReview.getByRole("button", { name: "Check proposed change", exact: true }).click();
    await expect(removalReview.getByText("Failed: Existing records fit this version", { exact: true })).toBeVisible();
    await expect(removalReview.getByRole("button", { name: "Publish", exact: true })).toHaveCount(0);
    const failedOwnerReviewPage = await owner.context.newPage();
    await failedOwnerReviewPage.goto(`/workspace?workspaceId=${workspaceId}&work=${app.id}`);
    await failedOwnerReviewPage.getByRole("tab", { name: "Review", exact: true }).click();
    const failedOwnerReview = failedOwnerReviewPage.locator("details").filter({ has: failedOwnerReviewPage.locator("summary").filter({ hasText: /^Review changes$/ }) });
    if (!await failedOwnerReview.evaluate(element => (element as HTMLDetailsElement).open)) await failedOwnerReview.locator("summary").click();
    await expect(failedOwnerReview.getByText("Failed: Existing records fit this version", { exact: true })).toBeVisible();
    await expect(failedOwnerReview.getByRole("button", { name: "Publish", exact: true })).toBeDisabled();
    await failedOwnerReviewPage.close();
    await makerRemovalPage.close();

    // The new release includes a hidden native field, but the recipient's
    // released form view does not. Server and browser boundaries reject it.
    await post(staff.context.request, `/api/apps/${app.id}`, {
      action: "submit",
      input: { record: { id: "hidden", values: { internal_note: "forged" } }, releaseVersion: 2, idempotencyKey: "hidden-field" },
    }, 403);
    await post(staff.context.request, `/api/apps/${app.id}`, {
      action: "submit",
      input: { record: { id: "forged-owner", values: { problem: "x" }, createdBy: owner.userId }, releaseVersion: 2, idempotencyKey: "forged-owner" },
    }, 400);

    // Rollback changes only the active release pointer. The accepted record
    // remains in the canonical records table and is visible under v1 again.
    const current = await owner.context.request.get(`/api/bounded-work?productId=applications&workId=${app.id}`);
    const currentPayload = await current.json();
    app = await applicationCommand(owner.context.request, app.id, {
      kind: "rollback_release",
      expectedDesignRevision: currentPayload.payload.candidate.designRevision,
      expectedReleaseVersion: currentPayload.payload.release.version,
      version: 1,
    });
    use = await readUse(staff.context.request, app.id);
    expect(use.releaseVersion).toBe(1);
    expect(use.records).toHaveLength(2);
    expect(use.records[0].values.problem).toBe("Leaking tap in upstairs bathroom");
    expect(use.records.map((record: { values: { priority?: string } }) => record.values.priority)).toEqual(["standard", "urgent"]);

    // Reopen the owner surface to prove the grant list is durable, then revoke
    // the same link through the owner control.
    const reopenedOwnerPage = await owner.context.newPage();
    await reopenedOwnerPage.goto(`/workspace?workspaceId=${workspaceId}&work=${app.id}`);
    await reopenedOwnerPage.getByRole("tab", { name: "Sharing", exact: true }).click();
    await expect(reopenedOwnerPage.getByText(`Link for ${staff.email}`, { exact: true })).toBeVisible();
    await reopenedOwnerPage.getByRole("button", { name: "Revoke link", exact: true }).click();
    await expect(reopenedOwnerPage.getByText(`Access revoked for ${staff.email}`, { exact: true })).toBeVisible();
    await reopenedOwnerPage.close();
    await expect(readUse(staff.context.request, app.id, 403)).resolves.toBeNull();
    expect((await staff.context.request.post(`/api/apps/${app.id}`, {
      headers: { origin: env.app, "sec-fetch-site": "same-origin", "content-type": "application/json" },
      data: { action: "submit", input: { record: { id: "after-revoke", values: { problem: "denied" } }, releaseVersion: 1, idempotencyKey: "after-revoke" } },
    })).status()).toBe(403);
    await page.reload();
    await expect(page.getByRole("heading", { name: "This application link is unavailable", exact: true })).toBeVisible();
    await expect(page.locator('p[role="alert"]')).toContainText("no longer available");
    await page.screenshot({ path: testInfo.outputPath("application-use-revoked.png"), fullPage: true });

    expect(apiPaths.some(path => /chat|agent|generate|workspace/.test(path))).toBe(false);
  } catch (error) {
    primaryFailure = error;
    throw error;
  } finally {
    const cleanup = await Promise.allSettled([maker?.context.close(), owner.context.close(), staff.context.close()]);
    if (primaryFailure === undefined) {
      const failed = cleanup.find(result => result.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
    }
  }
});

test("a verified recipient edits a date record through a stale correction and recovers it", async ({ browser }) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, "application-edit-owner");
  const staff = await signedInContext(browser, admin, "application-edit-staff");
  const editor = await signedInContext(browser, admin, "application-edit-all");
  let maker: Awaited<ReturnType<typeof ordinaryAgencyMaker>> | undefined;
  try {
    const workspaceId = await ordinaryCustomerBusiness(owner, "Local agency-built tool customer");
    const refused = await post(owner.context.request, "/api/bounded-work", { action: "create", productId: "applications", workspaceId,
      input: { title: "Customer cannot build", fields: [{ id: "request", label: "Request", type: "text", required: true }], components: [{ kind: "form", fields: ["request"] }] } }, 403);
    expect(refused.code).toBe("make_systems_required");
    maker = await ordinaryAgencyMaker(browser, admin, owner, workspaceId);

    let app = await post(maker.context.request, "/api/bounded-work", {
      action: "create",
      productId: "applications",
      workspaceId,
      input: {
        title: "Repair appointments",
        fields: [
          { id: "visit_date", label: "Visit date", type: "date", required: true },
          { id: "problem", label: "Problem", type: "text", required: true },
        ],
        components: [{ kind: "form", fields: ["visit_date", "problem"] }, { kind: "list", fields: ["visit_date", "problem"] }],
      },
    }, 201);
    app = await applicationCommand(maker.context.request, app.id, { kind: "rehearse", expectedRevision: app.payload.revision });
    app = await applicationCommand(owner.context.request, app.id, { kind: "install", expectedRevision: app.payload.revision });
    await grantOrdinaryAgencyAppDraft(owner, maker, workspaceId, app);

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await post(owner.context.request, `/api/apps/${app.id}/access`, {
      recipientEmail: staff.email,
      views: ["form", "list"],
      recordRead: "all",
      recordEdit: "own",
      recordSubmit: true,
      purpose: "Correct appointment records",
      expiresAt,
    }, 201);
    await post(owner.context.request, `/api/apps/${app.id}/access`, {
      recipientEmail: editor.email,
      views: ["form", "list"],
      recordRead: "all",
      recordEdit: "all",
      recordSubmit: false,
      purpose: "Review all appointment corrections",
      expiresAt,
    }, 201);

    const page = await staff.context.newPage();
    await page.goto(`/apps/${app.id}`);
    await expect(page.getByRole("heading", { name: "Repair appointments", exact: true })).toBeVisible();
    await page.getByLabel("Visit date", { exact: true }).fill("2024-02-29");
    await page.getByLabel("Problem", { exact: true }).fill("Loose front door");
    await page.getByRole("button", { name: "Submit record", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Record submitted.");

    let use = await readUse(staff.context.request, app.id);
    expect(use.records).toHaveLength(1);
    expect(use.records[0]).toMatchObject({ values: { visit_date: "2024-02-29", problem: "Loose front door" }, revision: 1 });
    const recordId = use.records[0].id as string;

    await page.getByRole("button", { name: "Edit record", exact: true }).click();
    await page.getByLabel("Visit date", { exact: true }).fill("2024-03-01");
    await page.getByLabel("Problem", { exact: true }).fill("Correction kept after conflict");

    await post(editor.context.request, `/api/apps/${app.id}`, {
      action: "edit",
      input: {
        record: { id: recordId, values: { visit_date: "2024-03-02", problem: "Editor changed this first" } },
        releaseVersion: 1,
        expectedRecordRevision: 1,
        idempotencyKey: "editor-first-correction",
      },
    });
    await page.getByRole("button", { name: "Save correction", exact: true }).click();
    await expect(page.locator('[id$="application-submit-error"]')).toContainText("Your correction is still here");
    await expect(page.getByLabel("Visit date", { exact: true })).toHaveValue("2024-03-01");
    await expect(page.getByLabel("Problem", { exact: true })).toHaveValue("Correction kept after conflict");
    use = await readUse(staff.context.request, app.id);
    expect(use.records[0]).toMatchObject({ values: { visit_date: "2024-03-02", problem: "Editor changed this first" }, revision: 2 });

    await page.getByRole("button", { name: "Reload application", exact: true }).click();
    await page.getByRole("button", { name: "Cancel correction", exact: true }).click();
    await page.getByRole("button", { name: "Edit record", exact: true }).click();
    await page.getByLabel("Visit date", { exact: true }).fill("2024-03-03");
    await page.getByLabel("Problem", { exact: true }).fill("Correction recovered");
    await page.getByRole("button", { name: "Save correction", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Correction saved.");
    use = await readUse(staff.context.request, app.id);
    expect(use.records[0]).toMatchObject({ values: { visit_date: "2024-03-03", problem: "Correction recovered" }, revision: 3 });

    await post(staff.context.request, `/api/apps/${app.id}`, {
      action: "edit",
      input: {
        record: { id: recordId, values: { visit_date: "2024-02-30", problem: "Invalid date" } },
        releaseVersion: 1,
        expectedRecordRevision: 3,
        idempotencyKey: "invalid-date-rejected",
      },
    }, 400);
    await post(editor.context.request, `/api/apps/${app.id}`, {
      action: "edit",
      input: {
        record: { id: recordId, values: { visit_date: "2024-03-02", problem: "Editor changed this first" } },
        releaseVersion: 1,
        expectedRecordRevision: 1,
        idempotencyKey: "editor-first-correction",
      },
    });
    use = await readUse(staff.context.request, app.id);
    expect(use.records[0]).toMatchObject({ values: { visit_date: "2024-03-03", problem: "Correction recovered" }, revision: 3 });
    await page.close();
  } finally {
    await maker?.context.close();
    await owner.context.close();
    await staff.context.close();
    await editor.context.close();
  }
});

test("ordinary agency template becomes a private native app, then a live app without copying preview records", async ({ browser }, info) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, "template-owner");
  let maker: Awaited<ReturnType<typeof ordinaryAgencyMaker>> | undefined;
  try {
    const workspaceId = await ordinaryCustomerBusiness(owner, "Local agency template customer");
    const refused = await post(owner.context.request, "/api/bounded-work", { action: "create", productId: "applications", workspaceId,
      input: { title: "Customer cannot build", fields: [{ id: "request", label: "Request", type: "text", required: true }], components: [{ kind: "form", fields: ["request"] }] } }, 403);
    expect(refused.code).toBe("make_systems_required");
    maker = await ordinaryAgencyMaker(browser, admin, owner, workspaceId);
    const page = await maker.context.newPage();
    await page.goto(`/workspace?workspaceId=${workspaceId}&view=products`);
    await page.getByRole("button", { name: "Preview Staff requests", exact: true }).click();
    await page.getByLabel("App name", { exact: true }).fill("Studio requests");
    const preview = page.getByRole("region", { name: "Interactive app preview", exact: true });
    await preview.getByLabel("Name", { exact: true }).fill("Preview user");
    await preview.getByLabel("Request", { exact: true }).fill("This stays in preview");
    await preview.getByRole("combobox", { name: /Urgency/ }).selectOption("Normal");
    await preview.getByRole("button", { name: "Submit record", exact: true }).click();
    await expect(preview.getByText("Test record added. Nothing was saved or shared.", { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath("template-private-preview-desktop.png"), fullPage: true });
    const createdResponse = page.waitForResponse(response => response.url().includes("/api/bounded-work") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Create private tool", exact: true }).click();
    const response = await createdResponse;
    expect(response.status(), await response.text()).toBe(201);
    const app = await response.json();
    expect(app.workspaceId).toBe(workspaceId);
    expect(app.productId).toBe("applications");
    expect(app.payload.spec.title).toBe("Studio requests");
    expect(app.payload.records).toEqual([]);
    expect(app.payload.releases || []).toHaveLength(0);
    await page.getByRole("button", { name: "Open it", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Preview", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Studio requests", exact: true }).first()).toBeVisible();
    await page.getByRole("tab", { name: "Edit", exact: true }).click();
    const review = page.locator("details").filter({ has: page.locator("summary").filter({ hasText: /^Review changes$/ }) });
    if (!await review.evaluate(element => (element as HTMLDetailsElement).open)) await review.locator("summary").click();
    await review.getByRole("button", { name: "Check proposed change", exact: true }).click();
    await expect(review.getByRole("button", { name: "Publish", exact: true })).toHaveCount(0);
    const customerPage = await owner.context.newPage();
    await customerPage.goto(`/workspace?workspaceId=${workspaceId}&work=${app.id}`);
    await customerPage.getByRole("tab", { name: "Review", exact: true }).click();
    const customerReview = customerPage.locator("details").filter({ has: customerPage.locator("summary").filter({ hasText: /^Review changes$/ }) });
    if (!await customerReview.evaluate(element => (element as HTMLDetailsElement).open)) await customerReview.locator("summary").click();
    await expect(customerReview.getByRole("button", { name: "Publish", exact: true })).toBeEnabled();
    await customerReview.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(customerPage.getByText(/Version 1 is live\./).first()).toBeVisible();
    await customerPage.getByRole("tab", { name: "Use", exact: true }).click();
    const use = customerPage.getByRole("tabpanel", { name: "Use", exact: true });
    await expect(use.getByText("This stays in preview", { exact: true })).toHaveCount(0);
    await customerPage.getByRole("tab", { name: "Sharing", exact: true }).click();
    await expect(customerPage.getByRole("heading", { name: "Give someone a link", exact: true })).toBeVisible();
    // No grant is created by choosing a template, previewing it, or publishing it.
    const links = await owner.context.request.get(`/api/apps/${app.id}/access`);
    expect(links.status(), await links.text()).toBe(200);
    expect((await links.json()).grants).toHaveLength(0);
    await customerPage.setViewportSize({ width: 390, height: 844 });
    await customerPage.reload();
    await expect(customerPage.getByRole("tab", { name: "Use", exact: true })).toBeVisible();
    expect(await customerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await customerPage.screenshot({ path: info.outputPath("agency-built-live-app-mobile.png"), fullPage: true });
  } finally { await maker?.context.close(); await owner.context.close(); }
});
