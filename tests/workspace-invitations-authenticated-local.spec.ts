import { randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type BrowserContext } from "@playwright/test";
import { localEnvironment, signedInContext } from "./support/local-auth";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires isolated local Supabase Auth and database.");
test.setTimeout(120_000);

async function signedInWithEmail(browser: Browser, admin: Pick<SupabaseClient, "auth">, email: string) {
  const env = localEnvironment();
  const password = `${randomUUID()}Aa1!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error("Could not create the invited local identity.");
  const context = await browser.newContext({ baseURL: env.app });
  const cookies: Array<Parameters<BrowserContext["addCookies"]>[0][number]> = [];
  const auth = createServerClient(env.url, env.anon, { cookies: {
    getAll: () => [],
    setAll: values => values.forEach(value => cookies.push({ name: value.name, value: value.value, domain: new URL(env.app).hostname, path: value.options.path || "/", httpOnly: Boolean(value.options.httpOnly), secure: false, sameSite: "Lax" })),
  } });
  const signedIn = await auth.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw new Error("The real local Auth service rejected the invited identity.");
  await context.addCookies(cookies);
  return { context, userId: created.data.user.id, email };
}

async function createThroughUi(page: Awaited<ReturnType<BrowserContext["newPage"]>>, email: string, role: "member" | "admin" | "owner") {
  await page.getByLabel("Recipient email").fill(email);
  await page.getByLabel("Workspace role").selectOption(role);
  expect(await page.getByLabel("Recipient email").evaluate(element => (element as HTMLInputElement).checkValidity())).toBe(true);
  const [response] = await Promise.all([
    page.waitForResponse(candidate => new URL(candidate.url()).pathname === "/api/workspace-invitations" && candidate.request().method() === "POST", { timeout: 10_000 }),
    page.getByRole("button", { name: "Create link" }).click(),
  ]);
  expect(response.status(), await response.text()).toBe(201);
  await expect(page.getByRole("status")).toContainText(`Invitation prepared for ${email}`);
  return page.getByLabel("Private invitation link").inputValue();
}

test("owner invitation links require explicit exact-email acceptance and preserve stronger membership", async ({ browser }, testInfo) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, "workspace-invite-owner");
  const existing = await signedInContext(browser, admin, "workspace-invite-existing-admin");
  const wrong = await signedInContext(browser, admin, "workspace-invite-wrong-account");
  const revokedRecipient = await signedInContext(browser, admin, "workspace-invite-revoked");
  const newRecipientEmail = `local-workspace-invite-new-${randomUUID()}@example.test`;
  const workspaceId = randomUUID();
  let newRecipient: Awaited<ReturnType<typeof signedInWithEmail>> | null = null;
  let ownerPage: Awaited<ReturnType<BrowserContext["newPage"]> | null> = null;
  try {
    expect((await admin.from("workspaces").insert({ id: workspaceId, kind: "customer", name: "Harbor Workshop", created_by: owner.userId })).error).toBeNull();
    expect((await admin.from("workspace_memberships").insert([
      { workspace_id: workspaceId, user_id: owner.userId, role: "owner", created_by: owner.userId },
      { workspace_id: workspaceId, user_id: existing.userId, role: "admin", created_by: owner.userId },
    ])).error).toBeNull();

    const ownerAccess = await owner.context.request.get(`/api/workspace-invitations?workspaceId=${workspaceId}`);
    expect(ownerAccess.status()).toBe(200);
    expect((await ownerAccess.json()).invitations).toEqual([]);

    ownerPage = await owner.context.newPage();
    await ownerPage.goto(`/workspace/invitations?workspaceId=${workspaceId}`);
    await expect(ownerPage.getByRole("heading", { name: "Invite a person" })).toBeVisible();
    const newRecipientLink = await createThroughUi(ownerPage, newRecipientEmail, "member");
    await ownerPage.screenshot({ path: testInfo.outputPath("workspace-invitations-owner-desktop.png"), fullPage: true });

    // The invitation exists before the addressed Supabase account. Its public
    // preview contains terms only and the recipient email is masked.
    const publicContext = await browser.newContext({ baseURL: env.app, viewport: { width: 390, height: 844 } });
    const publicPage = await publicContext.newPage();
    await publicPage.goto(newRecipientLink);
    await expect(publicPage.getByRole("heading", { name: "Join Harbor Workshop" })).toBeVisible();
    await expect(publicPage.getByText(newRecipientEmail, { exact: true })).toHaveCount(0);
    await expect(publicPage.getByRole("link", { name: "Create invited account" })).toHaveAttribute("href", /\/sign-up\?next=/);
    expect(await publicPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await publicPage.screenshot({ path: testInfo.outputPath("workspace-invitation-new-user-mobile.png"), fullPage: true });
    await publicContext.close();

    newRecipient = await signedInWithEmail(browser, admin, newRecipientEmail);
    const newPage = await newRecipient.context.newPage();
    await newPage.goto(newRecipientLink);
    await newPage.getByRole("button", { name: "Accept invitation" }).click();
    await expect(newPage.getByRole("heading", { name: "You joined Harbor Workshop." })).toBeVisible();
    await expect(newPage.getByText("Your role is member.")).toBeVisible();
    let membership = await admin.from("workspace_memberships").select("role").eq("workspace_id", workspaceId).eq("user_id", newRecipient.userId);
    expect(membership.error).toBeNull();
    expect(membership.data).toEqual([{ role: "member" }]);
    const repeated = await newRecipient.context.request.post(new URL(newRecipientLink).pathname.replace("/workspace/invitations", "/api/workspace-invitations"), { headers: { origin: env.app }, data: {} });
    expect(repeated.status(), await repeated.text()).toBe(200);
    expect((await repeated.json()).accepted.alreadyAccepted).toBe(true);
    membership = await admin.from("workspace_memberships").select("role").eq("workspace_id", workspaceId).eq("user_id", newRecipient.userId);
    expect(membership.data).toEqual([{ role: "member" }]);

    // An existing member explicitly accepts, while the lower invitation role
    // cannot downgrade the existing admin authority.
    const existingLink = await createThroughUi(ownerPage, existing.email, "member");
    const existingPage = await existing.context.newPage();
    await existingPage.setViewportSize({ width: 390, height: 844 });
    await existingPage.goto(existingLink);
    await existingPage.getByRole("button", { name: "Accept invitation" }).click();
    await expect(existingPage.getByText("Your existing higher role was kept.")).toBeVisible();
    const existingMembership = await admin.from("workspace_memberships").select("role").eq("workspace_id", workspaceId).eq("user_id", existing.userId).single();
    expect(existingMembership.data?.role).toBe("admin");
    expect(await existingPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    // Possession of the link under another verified identity cannot create a
    // membership or disclose an unmasked recipient address.
    const revokedLink = await createThroughUi(ownerPage, revokedRecipient.email, "member");
    const wrongPage = await wrong.context.newPage();
    await wrongPage.goto(revokedLink);
    await wrongPage.getByRole("button", { name: "Accept invitation" }).click();
    await expect(wrongPage.locator("p[role=alert]")).toContainText("exact verified email address");
    const wrongMembership = await admin.from("workspace_memberships").select("role").eq("workspace_id", workspaceId).eq("user_id", wrong.userId);
    expect(wrongMembership.data).toEqual([]);

    // Owner revocation is terminal and prevents the addressed identity's next
    // acceptance while retaining the invitation history.
    const revokedRow = ownerPage.locator("li").filter({ hasText: revokedRecipient.email });
    await revokedRow.getByRole("button", { name: "Revoke" }).click();
    await expect(revokedRow.locator("p").nth(1)).toContainText("· revoked ·");
    const durableRevocation = await admin.from("workspace_invitations").select("status").eq("workspace_id", workspaceId).eq("recipient_email", revokedRecipient.email).single();
    expect(durableRevocation.data?.status).toBe("revoked");
    const revokedPreview = await owner.context.request.get(new URL(revokedLink).pathname.replace("/workspace/invitations", "/api/workspace-invitations"));
    expect(revokedPreview.status()).toBe(200);
    expect((await revokedPreview.json()).invitation.status).toBe("revoked");
    const revokedPage = await revokedRecipient.context.newPage();
    await revokedPage.goto(revokedLink);
    await expect(revokedPage.getByText("The workspace owner revoked this invitation.")).toBeVisible();
    await expect(revokedPage.getByRole("button", { name: "Accept invitation" })).toHaveCount(0);
    const revokedMembership = await admin.from("workspace_memberships").select("role").eq("workspace_id", workspaceId).eq("user_id", revokedRecipient.userId);
    expect(revokedMembership.data).toEqual([]);
  } finally {
    await ownerPage?.close().catch(() => {});
    await admin.from("workspaces").delete().eq("id", workspaceId);
    for (const person of [owner, existing, wrong, revokedRecipient, ...(newRecipient ? [newRecipient] : [])]) {
      await person.context.close().catch(() => {});
      await admin.auth.admin.deleteUser(person.userId).catch(() => {});
    }
  }
});
