import { createClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { localEnvironment, signedInContext } from "./support/local-auth";

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
  try {
    const workspace = await owner.context.request.get("/api/workspace");
    expect(workspace.status(), await workspace.text()).toBe(200);
    const { workspaceId } = await workspace.json();

    let app = await post(owner.context.request, "/api/bounded-work", {
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
    app = await applicationCommand(owner.context.request, app.id, { kind: "rehearse", expectedRevision: app.payload.revision });
    app = await applicationCommand(owner.context.request, app.id, { kind: "install", expectedRevision: app.payload.revision });

    // Issue and copy the stable link from the owner application surface. The
    // recipient never receives a workspace membership or an owner dashboard.
    await owner.context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: env.app });
    const ownerPage = await owner.context.newPage();
    await ownerPage.goto(`/workspace?workspaceId=${workspaceId}&work=${app.id}`);
    await expect(ownerPage.getByRole("heading", { name: "Repair requests", exact: true })).toBeVisible();
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
    await page.getByLabel("Problem *", { exact: true }).fill("Leaking tap in upstairs bathroom");
    await page.getByRole("combobox", { name: /Priority/ }).selectOption("standard");
    await page.getByRole("button", { name: "Submit record", exact: true }).click();
    await expect(page.locator("#application-submit-error")).toContainText("current draft is still here");
    await recover();
    await expect(page.getByLabel("Problem *", { exact: true })).toHaveValue("Leaking tap in upstairs bathroom");

    await page.getByRole("button", { name: "Submit record", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Record submitted.");
    let use = await readUse(staff.context.request, app.id);
    expect(use.releaseVersion).toBe(1);
    expect(use.records).toEqual([{ id: expect.any(String), values: { problem: "Leaking tap in upstairs bathroom", priority: "standard" } }]);
    await page.screenshot({ path: testInfo.outputPath("application-use-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("application-use-mobile.png"), fullPage: true });

    // Add the next fields and view through the owner editor. The live app
    // remains unchanged until the separate review and Publish action below.
    const ownerEditPage = await owner.context.newPage();
    await ownerEditPage.goto(`/workspace?workspaceId=${workspaceId}&work=${app.id}`);
    await ownerEditPage.getByText("Edit proposed app", { exact: true }).click();
    await ownerEditPage.getByRole("button", { name: "Add field", exact: true }).click();
    await ownerEditPage.getByLabel("Label for New field 3", { exact: true }).fill("Equipment location");
    await ownerEditPage.getByRole("button", { name: "Add field", exact: true }).click();
    await ownerEditPage.getByLabel("Label for New field 4", { exact: true }).fill("Internal note");
    await ownerEditPage.getByRole("button", { name: "Add option", exact: true }).click();
    await ownerEditPage.getByLabel("Option 3 for Priority", { exact: true }).fill("vip");
    await ownerEditPage.getByLabel("Show Equipment location in form view", { exact: true }).check();
    await ownerEditPage.getByLabel("Show Equipment location in list view", { exact: true }).check();
    await ownerEditPage.getByLabel("View to add", { exact: true }).selectOption("detail");
    await ownerEditPage.getByRole("button", { name: "Add view", exact: true }).click();
    await ownerEditPage.getByLabel("Show Internal note in detail view", { exact: true }).check();
    let failedEdit = false;
    await ownerEditPage.route("**/api/bounded-work", async route => {
      if (!failedEdit && route.request().method() === "POST") {
        failedEdit = true;
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Owner edit interruption." }) });
        return;
      }
      await route.continue();
    });
    await ownerEditPage.getByRole("button", { name: "Save new draft", exact: true }).click();
    await expect(ownerEditPage.getByText("Owner edit interruption.", { exact: true })).toBeVisible();
    await expect(ownerEditPage.getByLabel("Label for Equipment location", { exact: true })).toHaveValue("Equipment location");
    await ownerEditPage.unroute("**/api/bounded-work");
    await ownerEditPage.getByRole("button", { name: "Save new draft", exact: true }).click();
    await expect(ownerEditPage.getByText('Field added: "Equipment location" (text, optional).', { exact: true })).toBeVisible();
    await expect(ownerEditPage.getByText('Field added: "Internal note" (text, optional).', { exact: true })).toBeVisible();
    await expect(ownerEditPage.getByText('Field changed: "Priority"; options change from standard, urgent to standard, urgent, vip.', { exact: true })).toBeVisible();
    await ownerEditPage.close();

    // The owner continues using the published form while the candidate is a
    // draft. The live form has no candidate-only field yet.
    const ownerUsePage = await owner.context.newPage();
    await ownerUsePage.goto(`/workspace?workspaceId=${workspaceId}&work=${app.id}`);
    await expect(ownerUsePage.getByText(/Version 1 is live\..*live use continues/i)).toBeVisible();
    await expect(ownerUsePage.getByLabel("Internal note", { exact: true })).toHaveCount(0);
    await ownerUsePage.getByText("Add another record", { exact: true }).click();
    await ownerUsePage.getByLabel("Problem", { exact: true }).fill("Broken stopcock in utility room");
    await ownerUsePage.getByRole("combobox", { name: /Priority/ }).selectOption("standard");
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
    const ownerReviewPage = await owner.context.newPage();
    await ownerReviewPage.goto(`/workspace?workspaceId=${workspaceId}&work=${app.id}`);
    const review = ownerReviewPage.locator("details").filter({ hasText: "Review changes" });
    await expect(review).toBeVisible();
    await expect(review.getByText('Field added: "Internal note" (text, optional).', { exact: true })).toBeVisible();
    await expect(review.getByText('Field changed: "Priority"; options change from standard, urgent to standard, urgent, vip.', { exact: true })).toBeVisible();
    await expect(review.getByText('View added: detail showing "Problem", "Internal note".', { exact: true })).toBeVisible();
    await expect(review.getByText("Not checked yet. Check this proposal to verify existing records.", { exact: true })).toBeVisible();
    await review.getByRole("button", { name: "Check proposed change", exact: true }).click();
    await expect(review.getByText("Checks for proposed version 2", { exact: true })).toBeVisible();
    await expect(review.getByText("Passed: Existing records fit this version", { exact: true })).toBeVisible();
    await expect(review.getByText(/Record compatibility check passed for this proposal/)).toBeVisible();
    await ownerReviewPage.screenshot({ path: testInfo.outputPath("application-review-desktop.png"), fullPage: true });
    await ownerReviewPage.setViewportSize({ width: 390, height: 844 });
    // Reload at the target viewport and prove the customer-visible contract:
    // the rail is hidden, the review uses the viewport, and the drawer can be
    // opened and closed without displacing the work.
    await ownerReviewPage.reload({ waitUntil: "domcontentloaded" });
    await expect(ownerReviewPage.getByText("Review changes", { exact: true })).toBeVisible();
    const mobileNavigation = ownerReviewPage.getByRole("complementary", { name: "Strelva navigation", exact: true });
    await expect(mobileNavigation).not.toBeVisible();
    const reviewMainBox = await ownerReviewPage.locator("main[data-frame-main]").boundingBox();
    expect(reviewMainBox?.x ?? -1).toBeLessThan(2);
    expect(reviewMainBox?.width ?? 0).toBeGreaterThan(300);
    expect(await ownerReviewPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await ownerReviewPage.getByRole("button", { name: "Open navigation", exact: true }).click();
    await expect(mobileNavigation).toBeVisible();
    await mobileNavigation.getByRole("button", { name: "Close navigation", exact: true }).click();
    await expect(mobileNavigation).not.toBeVisible();
    await review.getByRole("button", { name: "Publish", exact: true }).scrollIntoViewIfNeeded();
    await ownerReviewPage.screenshot({ path: testInfo.outputPath("application-review-mobile.png"), fullPage: true });
    await ownerReviewPage.setViewportSize({ width: 1440, height: 1000 });
    await expect(review.getByRole("button", { name: "Publish", exact: true })).toBeEnabled();
    await review.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(ownerReviewPage.getByText(/Version 2 is live/)).toBeVisible();
    await expect(ownerReviewPage.getByText("Review changes", { exact: true })).toHaveCount(0);
    const publishedOwnerResult = await owner.context.request.get(`/api/bounded-work?productId=applications&workId=${app.id}`);
    expect(publishedOwnerResult.status(), await publishedOwnerResult.text()).toBe(200);
    app = await publishedOwnerResult.json();
    await ownerReviewPage.close();
    await page.reload({ waitUntil: "domcontentloaded" });
    const priority = page.getByRole("combobox", { name: /Priority/ });
    await expect(priority).toBeVisible();
    await priority.selectOption("urgent");
    await page.getByLabel("Problem *", { exact: true }).fill("Replacement pipe cutter for van 3");
    await page.getByRole("button", { name: "Submit record", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Record submitted.");
    use = await readUse(staff.context.request, app.id);
    expect(use.releaseVersion).toBe(2);
    expect(use.records).toHaveLength(2);
    expect(use.records[1]?.values).toMatchObject({ problem: "Replacement pipe cutter for van 3", priority: "urgent" });

    // Removing a used choice creates a candidate, but the real rehearsal must
    // fail before Publish can change the live release.
    const ownerRemovalPage = await owner.context.newPage();
    await ownerRemovalPage.goto(`/workspace?workspaceId=${workspaceId}&work=${app.id}`);
    await ownerRemovalPage.getByText("Edit proposed app", { exact: true }).click();
    await ownerRemovalPage.getByLabel("Option 1 for Priority", { exact: true }).fill("normal");
    await ownerRemovalPage.getByRole("button", { name: "Save new draft", exact: true }).click();
    const removalReview = ownerRemovalPage.locator("details").filter({ hasText: "Review changes" });
    await expect(removalReview.getByText('Field changed: "Priority"; options change from standard, urgent, vip to normal, urgent, vip.', { exact: true })).toBeVisible();
    await removalReview.getByRole("button", { name: "Check proposed change", exact: true }).click();
    await expect(removalReview.getByText("Failed: Existing records fit this version", { exact: true })).toBeVisible();
    await expect(removalReview.getByRole("button", { name: "Publish", exact: true })).toBeDisabled();
    await ownerRemovalPage.close();

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
  } finally {
    await owner.context.close();
    await staff.context.close();
  }
});
