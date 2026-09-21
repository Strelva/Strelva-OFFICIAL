import { randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { localEnvironment, signedInContext } from "./support/local-auth";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires isolated local Supabase Auth and Postgres.");
test.setTimeout(120_000);

async function createInvitation(page: Page, recipientEmail: string): Promise<string> {
  await page.getByLabel("Recipient email").fill(recipientEmail);
  await page.getByLabel("Workspace role").selectOption("member");
  const [response] = await Promise.all([
    page.waitForResponse(candidate => new URL(candidate.url()).pathname === "/api/workspace-invitations" && candidate.request().method() === "POST"),
    page.getByRole("button", { name: "Create link", exact: true }).click(),
  ]);
  expect(response.status(), await response.text()).toBe(201);
  await expect(page.getByRole("status")).toContainText(`Invitation prepared for ${recipientEmail}`);
  return page.getByLabel("Private invitation link").inputValue();
}

type LocalAdmin = SupabaseClient;

async function deleteIdentity(admin: LocalAdmin, userId: string) {
  await admin.auth.admin.deleteUser(userId).catch(() => undefined);
}

async function closeContext(value: { context: BrowserContext } | null | undefined) {
  await value?.context.close().catch(() => undefined);
}

async function createEmailIdentity(browser: Browser, admin: LocalAdmin, email: string) {
  const password = `${randomUUID()}Aa1!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error("Could not create the invited local identity.");
  const context = await signedInContextWithCredentials(browser, email, password);
  return { context, userId: created.data.user.id, email };
}

async function signedInContextWithCredentials(browser: Browser, email: string, password: string) {
  const env = localEnvironment();
  const context = await browser.newContext({ baseURL: env.app });
  const cookies: Array<Parameters<BrowserContext["addCookies"]>[0][number]> = [];
  const auth = createServerClient(env.url, env.anon, { cookies: {
    getAll: () => [],
    setAll: values => values.forEach(value => cookies.push({ name: value.name, value: value.value, domain: new URL(env.app).hostname, path: value.options.path || "/", httpOnly: Boolean(value.options.httpOnly), secure: false, sameSite: "Lax" })),
  } });
  const signedIn = await auth.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw new Error(`The local Auth service rejected ${email}.`);
  await context.addCookies(cookies);
  return context;
}

test("a public continuation reaches the selected customer business once and keeps unsafe input recoverable", async ({ browser }) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, "continuity-customer-owner");
  const other = await signedInContext(browser, admin, "continuity-customer-other");
  const anonymous = await browser.newContext({ baseURL: env.app, viewport: { width: 390, height: 844 } });
  const customerWorkspaceId = randomUUID();
  const foreignWorkspaceId = randomUUID();
  const continuationId = randomUUID();
  const privateRequest = `Continuity request ${continuationId}`;
  const privateTitle = `Continuity result ${continuationId}`;
  let ownerPage: Page | null = null;
  let anonymousPage: Page | null = null;
  try {
    expect((await admin.from("workspaces").insert([
      { id: customerWorkspaceId, kind: "customer", name: "Continuity Customer Business", created_by: owner.userId },
      { id: foreignWorkspaceId, kind: "customer", name: "Foreign Continuity Business", created_by: other.userId },
    ])).error).toBeNull();
    expect((await admin.from("workspace_memberships").insert([
      { workspace_id: customerWorkspaceId, user_id: owner.userId, role: "owner", created_by: owner.userId },
      { workspace_id: foreignWorkspaceId, user_id: other.userId, role: "owner", created_by: other.userId },
    ])).error).toBeNull();

    const unsupported = await anonymous.request.post("/api/public-continuation", {
      headers: { origin: env.app },
      data: { version: 2, id: randomUUID(), businessName: "Unsupported", request: "Keep this local", result: "", resultTitle: "Unsupported", scope: "No", review: true, fileNames: [] },
    });
    expect(unsupported.status(), await unsupported.text()).toBe(422);
    expect((await anonymous.cookies()).some(cookie => cookie.name === "strelva_public_continuation")).toBe(false);

    const intake = await anonymous.request.post("/api/public-continuation", {
      headers: { origin: env.app },
      data: {
        version: 1,
        id: continuationId,
        businessName: "Publicly supplied business label",
        request: privateRequest,
        result: "A private customer brief is ready for review.",
        resultTitle: privateTitle,
        scope: "Prepared text only.",
        review: true,
        fileNames: [],
      },
    });
    expect(intake.status(), await intake.text()).toBe(200);
    const location = (await intake.json() as { location: string }).location;
    expect(location).toBe("/sign-in?next=%2Fworkspace%2Faccount%3Fcontinue%3Dpublic");
    expect(location).not.toContain(privateRequest);

    anonymousPage = await anonymous.newPage();
    await anonymousPage.goto("/workspace/account?continue=public");
    await expect(anonymousPage).toHaveURL(/\/sign-in\?next=%2Fworkspace%2Faccount%3Fcontinue%3Dpublic$/);
    const retained = await anonymous.cookies();
    expect(retained.find(cookie => cookie.name === "strelva_public_continuation")?.httpOnly).toBe(true);

    await owner.context.addCookies(retained);
    ownerPage = await owner.context.newPage();
    await ownerPage.setViewportSize({ width: 390, height: 844 });
    await ownerPage.goto("/workspace/account?continue=public");
    await expect(ownerPage.getByRole("heading", { name: `Continue “${privateTitle}”` })).toBeVisible();
    const destination = ownerPage.getByLabel("Save to", { exact: true });
    await expect(destination.locator("option")).toContainText(["Continuity Customer Business · customer"]);
    await destination.selectOption(customerWorkspaceId);
    const saveButton = ownerPage.getByRole("button", { name: "Save private brief", exact: true });
    await saveButton.focus();
    const saveResponse = ownerPage.waitForResponse(response => response.url().endsWith("/api/public-continuation/import") && response.request().method() === "POST");
    await ownerPage.keyboard.press("Enter");
    expect((await saveResponse).status()).toBe(201);

    const imported = await admin.from("public_continuation_imports").select("work_id,workspace_id,imported_by").eq("continuation_id", continuationId).single();
    expect(imported.error).toBeNull();
    expect(imported.data).toMatchObject({ workspace_id: customerWorkspaceId, imported_by: owner.userId });
    const workId = imported.data!.work_id as string;
    await expect(ownerPage).toHaveURL(new RegExp(`/workspace\\?workspaceId=${customerWorkspaceId}.*work=${workId}.*view=document`));
    await expect(ownerPage.getByLabel("Document text", { exact: true })).toHaveValue(new RegExp(privateRequest));

    // A browser retry resolves the same private work and does not duplicate it.
    await ownerPage.goto("/workspace/account?continue=public");
    await expect(ownerPage.getByText("Public session saved", { exact: true })).toBeVisible();
    await expect(ownerPage.getByRole("link", { name: "Open saved brief", exact: true })).toHaveAttribute("href", `/workspace?workspaceId=${customerWorkspaceId}&work=${workId}&view=document`);
    const repeats = await admin.from("public_continuation_imports").select("work_id").eq("continuation_id", continuationId);
    expect(repeats.data).toEqual([{ work_id: workId }]);

    // Membership in another business is required; a guessed or foreign ID is
    // rejected even by the original account that owns the continuation.
    const wrongBusiness = await owner.context.request.post("/api/public-continuation/import", {
      headers: { origin: env.app },
      data: { workspaceId: foreignWorkspaceId },
    });
    expect(wrongBusiness.status(), await wrongBusiness.text()).toBe(403);
    const foreignWork = await admin.from("saved_product_work").select("id").eq("workspace_id", foreignWorkspaceId).eq("product_id", "documents");
    expect(foreignWork.data).toEqual([]);

    await other.context.addCookies(retained);
    const otherPage = await other.context.newPage();
    await otherPage.goto("/workspace/account?continue=public");
    await expect(otherPage.getByText("Public session unavailable", { exact: true })).toBeVisible();
    await expect(otherPage.getByText(privateRequest, { exact: true })).toHaveCount(0);
    await otherPage.close();
  } finally {
    await closeContext({ context: anonymous });
    await closeContext(owner);
    await closeContext(other);
    await admin.from("workspaces").delete().in("id", [customerWorkspaceId, foreignWorkspaceId]);
    await deleteIdentity(admin, owner.userId);
    await deleteIdentity(admin, other.userId);
  }
});

test("an invitation recipient can recover the exact return path, while an expired link stays terminal", async ({ browser }) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, "continuity-invitation-owner");
  const recipientEmail = `continuity-recipient-${randomUUID()}@example.test`;
  const recipient = await createEmailIdentity(browser, admin, recipientEmail);
  const workspaceId = randomUUID();
  let ownerPage: Page | null = null;
  let recipientPage: Page | null = null;
  let publicPage: Page | null = null;
  let anonymousContext: BrowserContext | null = null;
  let expired: Awaited<ReturnType<typeof createEmailIdentity>> | null = null;
  try {
    expect((await admin.from("workspaces").insert({ id: workspaceId, kind: "customer", name: "Continuity Invite Business", created_by: owner.userId })).error).toBeNull();
    expect((await admin.from("workspace_memberships").insert({ workspace_id: workspaceId, user_id: owner.userId, role: "owner", created_by: owner.userId })).error).toBeNull();
    ownerPage = await owner.context.newPage();
    await ownerPage.goto(`/workspace/invitations?workspaceId=${workspaceId}`);
    const link = await createInvitation(ownerPage, recipientEmail);
    const token = new URL(link).pathname.split("/").at(-1)!;
    const target = `/workspace/invitations/accept/${token}`;

    anonymousContext = await browser.newContext({ baseURL: env.app, viewport: { width: 390, height: 844 } });
    publicPage = await anonymousContext.newPage();
    await publicPage.goto(link);
    await expect(publicPage.getByRole("heading", { name: "Join Continuity Invite Business" })).toBeVisible();
    await publicPage.getByRole("button", { name: "Accept invitation", exact: true }).click();
    await expect(publicPage).toHaveURL(/\/sign-in\?next=/);
    const signedOutLocation = new URL(publicPage.url());
    expect(signedOutLocation.pathname).toBe("/sign-in");
    expect(signedOutLocation.searchParams.get("next")).toBe(target);

    const failedCallback = await anonymousContext.request.get(`/auth/callback?error=access_denied&next=${encodeURIComponent(target)}`, { maxRedirects: 0 });
    expect(failedCallback.status()).toBe(307);
    expect(failedCallback.headers().location).toBe(`${env.app}/sign-in?error=auth_callback&reason=provider%3Aaccess_denied&next=${encodeURIComponent(target)}`);
    await anonymousContext.close();
    anonymousContext = null;

    recipientPage = await recipient.context.newPage();
    await recipientPage.goto(link);
    await recipientPage.getByRole("button", { name: "Accept invitation", exact: true }).click();
    await expect(recipientPage.getByRole("heading", { name: "You joined Continuity Invite Business." })).toBeVisible();
    const membership = await admin.from("workspace_memberships").select("role").eq("workspace_id", workspaceId).eq("user_id", recipient.userId);
    expect(membership.data).toEqual([{ role: "member" }]);

    // A newly created, then expired invitation remains inspectable as a
    // terminal state and cannot create access for the addressed identity.
    const expiredEmail = `continuity-expired-${randomUUID()}@example.test`;
    expired = await createEmailIdentity(browser, admin, expiredEmail);
    const expiredLink = await createInvitation(ownerPage, expiredEmail);
    const expiredToken = new URL(expiredLink).pathname.split("/").at(-1)!;
    const row = await admin.from("workspace_invitations").select("id").eq("workspace_id", workspaceId).eq("recipient_email", expiredEmail).single();
    expect(row.error).toBeNull();
    expect((await admin.from("workspace_invitations").update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", row.data!.id)).error).toBeNull();
    const expiredPage = await expired.context.newPage();
    await expiredPage.goto(expiredLink);
    await expect(expiredPage.getByText("This invitation expired. Ask the workspace owner for a new link.", { exact: true })).toBeVisible();
    await expect(expiredPage.getByRole("button", { name: "Accept invitation", exact: true })).toHaveCount(0);
    const expiredAccept = await expired.context.request.post(`/api/workspace-invitations/accept/${expiredToken}`, { headers: { origin: env.app }, data: {} });
    expect(expiredAccept.status(), await expiredAccept.text()).toBe(410);
    const expiredMembership = await admin.from("workspace_memberships").select("role").eq("workspace_id", workspaceId).eq("user_id", expired.userId);
    expect(expiredMembership.data).toEqual([]);
    await expiredPage.close();
  } finally {
    await closeContext(owner);
    await closeContext(recipient);
    await closeContext(expired);
    if (expired) await deleteIdentity(admin, expired.userId);
    await anonymousContext?.close().catch(() => undefined);
    await publicPage?.close().catch(() => undefined);
    await admin.from("workspaces").delete().eq("id", workspaceId);
    await deleteIdentity(admin, owner.userId);
    await deleteIdentity(admin, recipient.userId);
  }
});
