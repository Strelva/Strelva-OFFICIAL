import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { localEnvironment, signedInContext } from "./support/local-auth";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires an isolated local Supabase stack.");
test.setTimeout(120_000);

async function readyAuthority(page: Page, workId: string, access: "outside" | "member", navigate: () => Promise<unknown>) {
  // Register both exact native reads before navigation/reload. An outside
  // contribution grant permits participation, while shared context stays private.
  const reads = ["/api/work-context", "/api/work-participation"].map(path => page.waitForResponse(response => {
    const url = new URL(response.url());
    return response.request().method() === "GET" && url.pathname === path && url.searchParams.get("workId") === workId && !url.searchParams.has("view");
  }, { timeout: 20_000 }));
  const [responses] = await Promise.all([Promise.all(reads), navigate()]);
  const [context, participation] = responses;
  expect(context!.headers()["content-type"]).toContain("application/json");
  if (access === "outside") {
    expect(context!.status(), await context!.text()).toBe(403);
    expect(await context!.json()).toEqual({ error: "You do not have current access for this work action." });
    await expect(page.getByRole("region", { name: "Sources for this work", exact: true })).toHaveCount(0);
  } else {
    expect(context!.status(), await context!.text()).toBe(200);
    expect((await context!.json()).version).toBe(1);
  }
  expect(participation!.status(), await participation!.text()).toBe(200);
  expect(participation!.headers()["content-type"]).toContain("application/json");
  expect((await participation!.json()).version).toBe(1);
  return participation!.json();
}
function participationMutation(page: Page, workId: string, kind: "contribute" | "review" | "revoke") {
  return page.waitForResponse(response => {
    if (response.request().method() !== "POST" || new URL(response.url()).pathname !== "/api/work-participation") return false;
    const body = response.request().postDataJSON();
    return body.workId === workId && body.command?.kind === kind;
  }, { timeout: 20_000 });
}

test("verified outside contribution survives review and loses access on revocation", async ({ browser }, testInfo) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, "contribution-owner");
  const guest = await signedInContext(browser, admin, "contribution-guest");
  try {
    const snapshotResponse = await owner.context.request.get("/api/workspace");
    expect(snapshotResponse.status()).toBe(200);
    const snapshot = await snapshotResponse.json();
    // Synchronize the guest's existing verified identity without granting membership in the owner's workspace.
    expect((await guest.context.request.get("/api/workspace")).status()).toBe(200);
    const created = await owner.context.request.post("/api/documents", { headers: { origin: env.app }, data: { action: "create", workspaceId: snapshot.workspaceId, input: { title: "Local contribution procedure", text: "The business opens at nine." } } });
    expect(created.status(), await created.text()).toBe(200);
    const document = await created.json();
    const granted = await owner.context.request.post("/api/work-participation", { headers: { origin: env.app }, data: { workId: document.workId, command: { kind: "grant", expectedRevision: 0, participantEmail: guest.email, participantKind: "person", scope: ["read", "propose"], purpose: "Clarify the opening procedure", expiresAt: new Date(Date.now() + 86400000).toISOString(), budgetMinor: 0, currency: "USD" } } });
    expect(granted.status()).toBe(200);
    const grant = (await granted.json()).grants[0];
    expect((await guest.context.request.get(`/api/documents?workId=${document.workId}`)).status()).toBe(403);
    const guestPage = await guest.context.newPage();
    await guestPage.setViewportSize({ width: 390, height: 844 });
    const guestAccess = await readyAuthority(guestPage, document.workId, "outside", () => guestPage.goto(`/workspace/contribute/${document.workId}`));
    expect(guestAccess).toMatchObject({ currentActorEmail: guest.email, canManage: false });
    await expect(guestPage.getByRole("heading", { name: "Local contribution procedure", exact: true })).toBeVisible();
    await expect(guestPage.getByText("The business opens at nine.", { exact: true })).toBeVisible();
    await guestPage.getByLabel("What changed?", { exact: true }).fill("Opening procedure clarified");
    await guestPage.getByLabel("Your proposal", { exact: true }).fill("Unlock the front door at nine, then check the incoming requests.");
    const [submitted] = await Promise.all([
      participationMutation(guestPage, document.workId, "contribute"),
      guestPage.getByRole("button", { name: "Submit for review", exact: true }).click(),
    ]);
    expect(submitted.status(), await submitted.text()).toBe(200);
    expect(submitted.request().postDataJSON()).toMatchObject({ workId: document.workId, command: { kind: "contribute", grantId: grant.id, baseWorkRevision: "0" } });
    expect((await submitted.json()).contributions).toEqual(expect.arrayContaining([expect.objectContaining({ grantId: grant.id, actorEmail: guest.email, summary: "Opening procedure clarified", content: "Unlock the front door at nine, then check the incoming requests.", status: "pending" })]));
    await expect(guestPage.getByRole("status")).toContainText("Contribution sent for review.");
    const persistedContribution = await readyAuthority(guestPage, document.workId, "outside", () => guestPage.reload());
    expect(persistedContribution.contributions).toEqual(expect.arrayContaining([expect.objectContaining({ grantId: grant.id, summary: "Opening procedure clarified", status: "pending" })]));
    await expect(guestPage.getByText("Opening procedure clarified", { exact: true })).toBeVisible();
    expect(await guestPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await guestPage.screenshot({ path: testInfo.outputPath("contribution-mobile.png"), fullPage: true });
    const ownerPage = await owner.context.newPage();
    const ownerAccess = await readyAuthority(ownerPage, document.workId, "member", () => ownerPage.goto(`/workspace/contribute/${document.workId}`));
    expect(ownerAccess).toMatchObject({ currentActorEmail: owner.email, canManage: true });
    await ownerPage.getByLabel("Review reason", { exact: true }).fill("Matches the agreed opening sequence");
    const [reviewed] = await Promise.all([
      participationMutation(ownerPage, document.workId, "review"),
      ownerPage.getByRole("button", { name: "Accept proposal", exact: true }).click(),
    ]);
    expect(reviewed.status(), await reviewed.text()).toBe(200);
    expect((await reviewed.json()).contributions).toEqual(expect.arrayContaining([expect.objectContaining({ grantId: grant.id, status: "accepted", reviewedBy: owner.userId })]));
    await expect(ownerPage.getByRole("status")).toContainText("Review saved. The original work has not been changed.");
    await ownerPage.screenshot({ path: testInfo.outputPath("contribution-desktop.png"), fullPage: true });
    const unchanged = await owner.context.request.get(`/api/documents?workId=${document.workId}`);
    expect((await unchanged.json()).document.text).toBe("The business opens at nine.");
    const [revoked] = await Promise.all([
      participationMutation(ownerPage, document.workId, "revoke"),
      ownerPage.getByRole("button", { name: "Revoke access", exact: true }).click(),
    ]);
    expect(revoked.status(), await revoked.text()).toBe(200);
    expect((await revoked.json()).grants).toEqual(expect.arrayContaining([expect.objectContaining({ id: grant.id, status: "revoked" })]));
    await expect(ownerPage.getByRole("status")).toContainText("Work access updated.");
    await guestPage.reload();
    await expect(guestPage.getByRole("heading", { name: "This work is not available to your account." })).toBeVisible();
    expect((await guest.context.request.get(`/api/work-participation?workId=${document.workId}&view=target`)).status()).toBe(403);
    const denied = await guest.context.request.post("/api/work-participation", { headers: { origin: env.app }, data: { workId: document.workId, command: { kind: "contribute", expectedRevision: 4, grantId: grant.id, baseWorkRevision: "0", summary: "Late contribution", content: "Must be denied", costMinor: 0, idempotencyKey: "after-revocation" } } });
    expect(denied.status()).toBe(403);
  } finally {
    await owner.context.close();
    await guest.context.close();
  }
});
