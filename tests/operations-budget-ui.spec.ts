import { expect, test, type Page } from "@playwright/test";

test.skip(process.env.STRELVA_WORKSPACE_RELEASE !== "1", "Requires a local workspace server; API responses are fictional fixtures.");
const workspaceId = "11111111-1111-4111-8111-111111111111";
const workId = "22222222-2222-4222-8222-222222222222";
const targetId = "33333333-3333-4333-8333-333333333333";
const budgetId = "44444444-4444-4444-8444-444444444444";
const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const at = "2026-09-12T12:00:00.000Z";
async function fixture(page: Page, mode: "proposal" | "unknown" | "readonly" = "proposal", budgetUnavailable = false, stopped = false) {
  const readOnly = mode === "readonly";
  const payload = { version: 1, revision: 0, title: "Update our handover", intent: "Keep the team document current", ownerId,
    status: mode === "unknown" ? "needs_attention" : "proposed", createdAt: at, updatedAt: at,
    ...(mode === "unknown" ? { approvedAt: at, approvedBy: ownerId, budgetId } : {}),
    steps: [{ id: "update", operation: "document.edit", workId: targetId, maximumCents: 100, dependsOn: [], input: { kind: "edit", expectedRevision: 0, title: "Team handover", text: "Confirm the next shift owner." },
      status: mode === "unknown" ? "unknown" : "pending", attempt: mode === "unknown" ? 1 : 0, ...(mode === "unknown" ? { effect: "unknown", reason: "The write may have completed. Verify the actual document before proceeding." } : {}) }], history: [] as Array<Record<string, unknown>> };
  const ledger = { id: budgetId, workspaceId, workId, productId: "operations", resourceKind: "responsibility", payerId: ownerId,
    status: mode === "unknown" ? "reserved" : "draft", estimateCents: 0, maxAuthorizedCents: 100,
    reservedCents: mode === "unknown" ? 100 : 0, usedCents: 0, strelvaRetryCents: 0, actualKnown: false, actualCents: null };
  let executions: Array<Record<string, unknown>> = mode === "unknown" ? [{ jobId: budgetId, executionKey: "fixture-step", maximumCents: 100, kind: "tool", attribution: "normal", status: "finished", effect: "unknown", amountCents: null, billableCents: null, createdBy: ownerId }] : [];
  const commands: string[] = [];
  await page.route("**/api/workspace**", route => route.fulfill({ json: {
    actor: { email: "owner@example.com", localPreview: false }, workspaceId,
    workspaces: [{ id: workspaceId, name: "Team workspace", kind: "personal", role: readOnly ? "member" : "owner", access: readOnly ? "delegated_read" : "member" }],
    ...(stopped ? { workspaceExitReadStatus: "completed" } : {}),
    work: [{ id: workId, workspaceId, title: payload.title, productId: "operations", resourceKind: "responsibility", payload: null, input: {}, createdAt: at }],
    handoffs: [], delegations: [], products: [{ id: "operations", name: "Delegated work", description: "Local proof", availability: "available" }],
  } }));
  await page.route("**/api/operations**", route => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      const kind = body.action === "run" ? "run" : body.command.kind;
      commands.push(kind);
      if (kind === "set_budget") Object.assign(payload, { budgetId: body.command.budgetId });
      if (kind === "approve") Object.assign(payload, { status: "ready", approvedBy: ownerId, approvedAt: at });
      if (kind === "run") {
        payload.status = "completed"; Object.assign(payload.steps[0]!, { status: "completed", attempt: 1, effect: "accepted" });
        executions = [{ jobId: budgetId, executionKey: "fixture-step", maximumCents: 100, kind: "tool", attribution: "normal", status: "finished", effect: "accepted", amountCents: 0, billableCents: 0, createdBy: ownerId }];
      }
      payload.revision++; payload.history.push({ revision: payload.revision, kind, actorId: ownerId, at });
    }
    return route.fulfill({ json: { id: workId, workspaceId, payload } });
  });
  await page.route("**/api/work-economics**", route => {
    if (budgetUnavailable) return route.fulfill({ status: 503, json: { error: "Budget storage is unavailable." } });
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      commands.push(`budget:${body.action}`);
      if (body.action === "accept") ledger.status = "accepted";
    }
    return route.fulfill({ json: { ledger, executions, usage: [], currentActorId: ownerId, canManage: !readOnly, canAccept: !readOnly && ledger.status === "draft" } });
  });
  await page.route("**/api/operational-assignments**", route => route.fulfill({ json: null }));
  await page.goto(`/workspace?workspaceId=${workspaceId}&work=${workId}`);
  await expect(page.getByRole("heading", { name: payload.title, exact: true })).toBeVisible();
  return commands;
}

test("an accepted budget attaches before work starts and cost recording stays automatic", async ({ page }) => {
  const commands = await fixture(page);
  await page.getByText("Budget and cost", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Accept this budget" })).toBeVisible();
  await page.getByRole("button", { name: "Approve and start this work" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Accept the proposed budget");
  expect(commands).toEqual([]);
  await page.getByRole("button", { name: "Accept this budget" }).click();
  await page.getByRole("button", { name: "Approve and start this work" }).click();
  await expect(page.getByRole("main").getByText("Completed", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Action costs" })).toContainText("Action accepted");
  await expect(page.getByRole("region", { name: "Action costs" })).toContainText("$0.00");
  expect(commands).toEqual(["budget:accept", "set_budget", "approve", "run"]);
  await expect(page.getByRole("button", { name: "Reserve amount" })).toHaveCount(0);
  await expect(page.getByText("Record a cost", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/does not charge your card/)).toBeVisible();
  await page.screenshot({ path: "/tmp/strelva-budget-completed-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect.poll(() => page.getByRole("main").evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThan(380);
  await page.screenshot({ path: "/tmp/strelva-budget-completed-mobile.png", fullPage: true });
});

test("an unknown effect holds the cap and offers verification rather than retry", async ({ page }) => {
  await fixture(page, "unknown");
  await page.getByText("Budget and cost", { exact: true }).click();
  await expect(page.getByRole("region", { name: "Action costs" })).toContainText("Up to $1.00 held");
  await expect(page.getByRole("region", { name: "Action costs" })).toContainText("Outcome needs verification");
  await expect(page.getByRole("button", { name: "Retry the failed step" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Close budget/ })).toHaveCount(0);
  await page.getByText("Resolve an interrupted action", { exact: true }).click();
  await expect(page.getByLabel("Evidence from the actual result")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect.poll(() => page.getByRole("main").evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThan(380);
  await page.screenshot({ path: "/tmp/strelva-budget-unknown-mobile.png", fullPage: true });
});

test("read-only budget inspection cannot accept, cancel, or start work", async ({ page }) => {
  await fixture(page, "readonly");
  await page.getByText("Budget and cost", { exact: true }).click();
  await expect(page.getByText(/Read-only access/)).toBeVisible();
  for (const name of ["Accept this budget", "Approve and start this work", "Cancel unused budget", "Propose budget"]) await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
});

test("unavailable budget storage prevents starting work and exposes recovery", async ({ page }) => {
  const commands = await fixture(page, "proposal", true);
  await page.getByRole("button", { name: "Approve and start this work" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("budget could not be checked");
  await expect(page.getByRole("button", { name: "Reload current state" })).toBeVisible();
  expect(commands).toEqual([]);
});

test("a stopped owner can review and reconcile an uncertain action without starting new work", async ({ page }) => {
  await fixture(page, "unknown", false, true);
  await expect(page.getByText("New work is paused for this workspace.", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Resolve an interrupted action", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry the failed step", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continue approved work", exact: true })).toHaveCount(0);
  await page.screenshot({ path: "/tmp/strelva-ongoing-stopped-owner-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "/tmp/strelva-ongoing-stopped-owner-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByText("Resolve an interrupted action", { exact: true }).click();
  await expect(page.getByLabel("Evidence from the actual result")).toBeVisible();
  await page.getByLabel("Evidence from the actual result").fill("The customer confirmed the document now contains the updated terms.");
  await page.getByRole("button", { name: "Record verified outcome", exact: true }).click();
  await expect(page.getByText("Resolve an interrupted action", { exact: true })).toBeVisible();
});
