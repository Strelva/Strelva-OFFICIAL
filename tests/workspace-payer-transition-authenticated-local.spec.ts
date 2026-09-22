import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { localEnvironment, signedInContext } from "./support/local-auth";

test.skip(
  process.env.STRELVA_LOCAL_AUTH_PROOF !== "1" || process.env.STRELVA_PAYER_TRANSITION_JOURNEY !== "1",
  "Requires local Supabase Auth/Postgres and the explicit payer-transition journey flag.",
);
test.setTimeout(180_000);

async function post(request: APIRequestContext, path: string, data: unknown, status = 200) {
  const response = await request.post(path, { headers: { origin: localEnvironment().app }, data });
  expect(response.status(), await response.text()).toBe(status);
  return status >= 200 && status < 300 ? response.json() : null;
}

async function openSettings(page: Page, workspaceId: string) {
  await page.goto(`/workspace?workspaceId=${workspaceId}`);
  await page.getByRole("complementary", { name: "Strelva navigation", exact: true }).getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Payer for future jobs", exact: true })).toBeVisible();
  return page.getByRole("region", { name: "Payer for future jobs", exact: true });
}

test("an exact verified successor accepts future jobs while existing unknown costs stay with the original payer", async ({ browser }, testInfo) => {
  testInfo.setTimeout(180_000);
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, "payer-owner");
  const successor = await signedInContext(browser, admin, "payer-successor");
  const wrong = await signedInContext(browser, admin, "payer-wrong-account");
  const removed = await signedInContext(browser, admin, "payer-removed-member");
  const workspaceId = randomUUID();
  const oldWorkId = randomUUID();
  const newWorkId = randomUUID();
  try {
    expect((await admin.from("workspaces").insert({ id: workspaceId, kind: "customer", name: "Payer Boundary Workshop", created_by: owner.userId })).error).toBeNull();
    expect((await admin.from("workspace_memberships").insert([
      { workspace_id: workspaceId, user_id: owner.userId, role: "owner", created_by: owner.userId },
    ])).error).toBeNull();
    expect((await admin.from("saved_product_work").insert([
      { id: oldWorkId, workspace_id: workspaceId, product_id: "operations", resource_kind: "responsibility", title: "Existing unknown-cost job", payload: {}, created_by: owner.userId },
      { id: newWorkId, workspace_id: workspaceId, product_id: "operations", resource_kind: "responsibility", title: "Job after payer acceptance", payload: {}, created_by: owner.userId },
    ])).error).toBeNull();

    let oldBudget = await post(owner.context.request, "/api/work-economics", {
      action: "create", workspaceId, workId: oldWorkId, productId: "operations", resourceKind: "responsibility",
      payerId: owner.userId, estimateCents: null, maxAuthorizedCents: 1_000,
    });
    oldBudget = await post(owner.context.request, "/api/work-economics", { action: "accept", jobId: oldBudget.ledger.id });
    oldBudget = await post(owner.context.request, "/api/work-economics", { action: "reserve", jobId: oldBudget.ledger.id, idempotencyKey: "old-hold", amountCents: 200 });
    oldBudget = await post(owner.context.request, "/api/work-economics", { action: "report_usage", jobId: oldBudget.ledger.id, idempotencyKey: "old-unknown", kind: "provider", attribution: "normal", amountCents: null });
    expect(oldBudget.ledger).toMatchObject({ payerId: owner.userId, maxAuthorizedCents: 1_000, reservedCents: 200, actualKnown: false });
    expect(oldBudget.usage).toEqual([expect.objectContaining({ amountCents: null, known: false })]);

    const ownerPage = await owner.context.newPage();
    const ownerPanel = await openSettings(ownerPage, workspaceId);
    await ownerPanel.getByLabel("Verified payer email").fill(successor.email);
    const [proposalResponse] = await Promise.all([
      ownerPage.waitForResponse(response => response.url().endsWith("/api/work-economics/payer-transition") && response.request().method() === "POST"),
      ownerPanel.getByRole("button", { name: "Propose new payer", exact: true }).click(),
    ]);
    expect(proposalResponse.status(), await proposalResponse.text()).toBe(200);
    const proposal = await proposalResponse.json();
    const transitionId = proposal.pending.id as string;
    await expect(ownerPanel).toContainText(successor.email);
    await ownerPage.screenshot({ path: testInfo.outputPath("payer-proposal-owner-desktop.png"), fullPage: true });

    const wrongAttempt = await wrong.context.request.post("/api/work-economics/payer-transition", {
      headers: { origin: env.app }, data: { action: "accept", transitionId },
    });
    expect(wrongAttempt.status(), await wrongAttempt.text()).toBe(403);

    const successorPage = await successor.context.newPage();
    await successorPage.setViewportSize({ width: 390, height: 844 });
    await successorPage.goto("/workspace/account");
    const successorPanel = successorPage.getByRole("region", { name: "Payer requests", exact: true });
    await expect(successorPanel).toContainText("does not grant access to a business or its saved work");
    expect(await successorPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await successorPage.screenshot({ path: testInfo.outputPath("payer-acceptance-mobile.png"), fullPage: true });

    let hidAcceptedResponse = false;
    await successorPage.route("**/api/work-economics/payer-transition", async route => {
      if (!hidAcceptedResponse && route.request().method() === "POST") {
        hidAcceptedResponse = true;
        const accepted = await route.fetch();
        expect(accepted.status(), await accepted.text()).toBe(200);
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Local proof hid the accepted response." }) });
        return;
      }
      await route.continue();
    });
    await successorPanel.getByRole("button", { name: "Accept future payer role", exact: true }).click();
    await expect(successorPanel.getByRole("alert")).toContainText("hid the accepted response");
    await successorPage.unroute("**/api/work-economics/payer-transition");
    await successorPanel.getByRole("button", { name: "Accept future payer role", exact: true }).click();
    await expect(successorPanel).toContainText("Accepted future payer role for Payer Boundary Workshop");
    await successorPage.setViewportSize({ width: 1440, height: 1000 });
    await expect(successorPanel).toBeVisible();
    await successorPage.screenshot({ path: testInfo.outputPath("payer-accepted-desktop.png"), fullPage: true });

    const newBudget = await post(owner.context.request, "/api/work-economics", {
      action: "create", workspaceId, workId: newWorkId, productId: "operations", resourceKind: "responsibility",
      payerId: owner.userId, estimateCents: 300, maxAuthorizedCents: 500,
    });
    expect(newBudget.ledger).toMatchObject({ payerId: successor.userId, maxAuthorizedCents: 500 });
    expect((await successor.context.request.get(`/api/operations?workId=${newWorkId}`)).status()).toBe(403);
    await successorPage.reload();
    const jobCard = successorPanel.locator("article").filter({ hasText: "operations" }).filter({ hasText: "$5.00" });
    await jobCard.getByRole("button", { name: "Accept $5.00 job limit", exact: true }).click();
    await expect(jobCard).toContainText("accepted");
    const claimed = await admin.rpc("job_economics_execution_command", {
      p_command: { action: "claim", jobId: newBudget.ledger.id, executionKey: "payer-only-runtime", maximumCents: 100, kind: "model", attribution: "normal" },
      p_actor_id: owner.userId, p_verified_email: owner.email,
    });
    expect(claimed.error).toBeNull();
    expect(claimed.data).toMatchObject({ claimed: true });

    const oldAfter = await owner.context.request.get(`/api/work-economics?jobId=${oldBudget.ledger.id}`);
    expect(oldAfter.status(), await oldAfter.text()).toBe(200);
    expect(await oldAfter.json()).toMatchObject({
      ledger: { payerId: owner.userId, maxAuthorizedCents: 1_000, reservedCents: 200, actualKnown: false },
      usage: [expect.objectContaining({ amountCents: null, known: false })],
    });
    const acceptedRows = await admin.from("workspace_payer_transitions").select("id,status,accepted_at").eq("id", transitionId);
    expect(acceptedRows.error).toBeNull();
    expect(acceptedRows.data).toEqual([{ id: transitionId, status: "accepted", accepted_at: expect.any(String) }]);

    const removedProposal = await post(owner.context.request, "/api/work-economics/payer-transition", { action: "propose", workspaceId, successorEmail: removed.email });
    expect((await admin.from("workspace_memberships").delete().eq("workspace_id", workspaceId).eq("user_id", owner.userId)).error).toBeNull();
    const removedAttempt = await removed.context.request.post("/api/work-economics/payer-transition", {
      headers: { origin: env.app }, data: { action: "accept", transitionId: removedProposal.pending.id },
    });
    expect(removedAttempt.status(), await removedAttempt.text()).toBe(200);
    expect((await removedAttempt.json()).transitions).toEqual(expect.arrayContaining([expect.objectContaining({ id: removedProposal.pending.id, status: "stale", acceptedAt: null })]));
  } finally {
    await admin.from("workspaces").delete().eq("id", workspaceId);
    for (const person of [owner, successor, wrong, removed]) {
      await person.context.close().catch(() => {});
      await admin.auth.admin.deleteUser(person.userId).catch(() => {});
    }
  }
});
