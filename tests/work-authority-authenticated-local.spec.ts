import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { localEnvironment, signedInContext } from "./support/local-auth";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires an isolated local Supabase stack.");
test.setTimeout(120_000);

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
    await guestPage.goto(`/workspace/contribute/${document.workId}`);
    await expect(guestPage.getByRole("heading", { name: "Local contribution procedure", exact: true })).toBeVisible();
    await expect(guestPage.getByText("The business opens at nine.", { exact: true })).toBeVisible();
    await guestPage.getByLabel("What changed?", { exact: true }).fill("Opening procedure clarified");
    await guestPage.getByLabel("Your proposal", { exact: true }).fill("Unlock the front door at nine, then check the incoming requests.");
    await guestPage.getByRole("button", { name: "Submit for review", exact: true }).click();
    await expect(guestPage.getByRole("status")).toContainText("Contribution sent for review.");
    await guestPage.reload();
    await expect(guestPage.getByText("Opening procedure clarified", { exact: true })).toBeVisible();
    expect(await guestPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await guestPage.screenshot({ path: testInfo.outputPath("contribution-mobile.png"), fullPage: true });
    const ownerPage = await owner.context.newPage();
    await ownerPage.goto(`/workspace/contribute/${document.workId}`);
    await ownerPage.getByLabel("Review reason", { exact: true }).fill("Matches the agreed opening sequence");
    await ownerPage.getByRole("button", { name: "Accept proposal", exact: true }).click();
    await expect(ownerPage.getByRole("status")).toContainText("Review saved. The original work has not been changed.");
    await ownerPage.screenshot({ path: testInfo.outputPath("contribution-desktop.png"), fullPage: true });
    const unchanged = await owner.context.request.get(`/api/documents?workId=${document.workId}`);
    expect((await unchanged.json()).document.text).toBe("The business opens at nine.");
    await ownerPage.getByRole("button", { name: "Revoke access", exact: true }).click();
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
