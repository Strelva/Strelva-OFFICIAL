import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { localEnvironment, signedInContext } from "./support/local-auth";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires an isolated local Supabase Auth and database.");
test.setTimeout(180_000);

type LocalIdentity = Awaited<ReturnType<typeof signedInContext>>;

function shortId(): string {
  return randomUUID().replaceAll("-", "").slice(0, 12);
}

async function responseJson(response: Awaited<ReturnType<APIRequestContext["post"]>>): Promise<unknown> {
  return response.json().catch(() => null);
}

async function postWebsiteCommand(
  request: APIRequestContext,
  body: Record<string, unknown>,
  expectedStatus = 200,
): Promise<{ websiteBinding?: { id: string; tenantId: string; status: string } }> {
  const response = await request.post("/api/offerings/websites", {
    headers: { origin: localEnvironment().app },
    data: body,
  });
  const value = await responseJson(response);
  expect(response.status(), JSON.stringify(value)).toBe(expectedStatus);
  return (value ?? {}) as { websiteBinding?: { id: string; tenantId: string; status: string } };
}

async function getOfferings(request: APIRequestContext, businessId: string, expectedStatus = 200): Promise<Record<string, unknown>> {
  const response = await request.get(`/api/offerings?businessId=${encodeURIComponent(businessId)}`);
  const value = await responseJson(response);
  expect(response.status(), JSON.stringify(value)).toBe(expectedStatus);
  return (value ?? {}) as Record<string, unknown>;
}

async function closeContext(context: BrowserContext | Page | undefined): Promise<void> {
  await context?.close().catch(() => {});
}

async function bestEffortCleanup(
  admin: SupabaseClient,
  workspaceIds: readonly string[],
  tenantIds: readonly string[],
  identities: readonly LocalIdentity[],
): Promise<void> {
  // The offering binding table is intentionally revoked from direct table
  // access. Local proof data is unique to the isolated project; attempt the
  // ordinary cleanup path and leave the fixture intact if that boundary rejects
  // direct deletion.
  await admin.from("offering_website_bindings").delete().in("business_workspace_id", [...workspaceIds]);
  await admin.from("workspaces").delete().in("id", [...workspaceIds]);
  await admin.from("tenants").delete().in("id", [...tenantIds]);
  for (const identity of identities) await admin.auth.admin.deleteUser(identity.userId).catch(() => {});
}

async function waitForAssignment(page: Page, businessName: string): Promise<void> {
  const handoff = page.getByTestId("website-assignment-handoff");
  await expect(handoff).toBeVisible();
  await expect(handoff).toContainText(`Assign a website to ${businessName}`);
}

test("local Auth and Postgres enforce business website assignment through the customer workspace", async ({ browser }) => {
  const env = localEnvironment();
  const adminDb = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  let owner: LocalIdentity | undefined;
  let administrator: LocalIdentity | undefined;
  let member: LocalIdentity | undefined;
  let stranger: LocalIdentity | undefined;
  const workspaceIds: [string, string, string, string] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const tenantIds: [string, string, string] = [`local-offering-owner-${shortId()}`, `local-offering-admin-${shortId()}`, `local-offering-retry-${shortId()}`];
  const tenantStableIds: [string, string, string] = [randomUUID(), randomUUID(), randomUUID()];

  try {
    owner = await signedInContext(browser, adminDb, "offering-owner");
    administrator = await signedInContext(browser, adminDb, "offering-admin");
    member = await signedInContext(browser, adminDb, "offering-member");
    stranger = await signedInContext(browser, adminDb, "offering-stranger");

    const businesses = await adminDb.from("workspaces").insert([
      { id: workspaceIds[0], kind: "customer", name: "Local Owner Business", created_by: owner.userId },
      { id: workspaceIds[1], kind: "customer", name: "Local Admin Business", created_by: owner.userId },
      { id: workspaceIds[2], kind: "customer", name: "Local Retry Business", created_by: owner.userId },
      { id: workspaceIds[3], kind: "customer", name: "Local Other Business", created_by: stranger.userId },
    ]);
    expect(businesses.error).toBeNull();

    const businessMemberships = await adminDb.from("workspace_memberships").insert([
      { workspace_id: workspaceIds[0], user_id: owner.userId, role: "owner", created_by: owner.userId },
      { workspace_id: workspaceIds[0], user_id: member.userId, role: "member", created_by: owner.userId },
      { workspace_id: workspaceIds[1], user_id: administrator.userId, role: "admin", created_by: owner.userId },
      { workspace_id: workspaceIds[2], user_id: owner.userId, role: "owner", created_by: owner.userId },
      { workspace_id: workspaceIds[3], user_id: stranger.userId, role: "owner", created_by: stranger.userId },
    ]);
    expect(businessMemberships.error).toBeNull();

    const tenantRows = await adminDb.from("tenants").insert([
      { id: tenantIds[0], stable_id: tenantStableIds[0], site_name: "Local Owner Website", owner_name: "Owner", owner_email: owner.email, active: true, site_url: "https://owner.local.test" },
      { id: tenantIds[1], stable_id: tenantStableIds[1], site_name: "Local Admin Website", owner_name: "Admin", owner_email: administrator.email, active: true, site_url: "https://admin.local.test" },
      { id: tenantIds[2], stable_id: tenantStableIds[2], site_name: "Local Retry Website", owner_name: "Owner", owner_email: owner.email, active: true, site_url: "https://retry.local.test" },
    ]);
    expect(tenantRows.error).toBeNull();

    const tenantMemberships = await adminDb.from("memberships").insert([
      { user_id: owner.userId, tenant_id: tenantIds[0], role: "owner" },
      { user_id: member.userId, tenant_id: tenantIds[0], role: "viewer" },
      { user_id: administrator.userId, tenant_id: tenantIds[1], role: "owner" },
      { user_id: owner.userId, tenant_id: tenantIds[2], role: "owner" },
    ]);
    expect(tenantMemberships.error).toBeNull();

    // A member can read the business offering and see the account-authorized
    // site, but the customer-facing handoff exposes no mutation control.
    const memberPage = await member.context.newPage();
    await memberPage.goto(`/workspace?workspaceId=${workspaceIds[0]}`, { waitUntil: "domcontentloaded" });
    await waitForAssignment(memberPage, "Local Owner Business");
    await expect(memberPage.getByText("Only a business owner or admin can assign a website to Local Owner Business.", { exact: false })).toBeVisible();
    await expect(memberPage.getByRole("button", { name: "Assign Local Owner Website to Local Owner Business", exact: true })).toHaveCount(0);
    await postWebsiteCommand(member.context.request, {
      action: "bind_managed_website",
      businessId: workspaceIds[0],
      tenantId: tenantIds[0]!,
      idempotencyKey: `member-denied-${shortId()}`,
    }, 403);

    // A workspace member in another business cannot even inspect the offering
    // collection, which keeps business ownership separate from site access.
    await getOfferings(owner.context.request, workspaceIds[3], 403);
    await postWebsiteCommand(owner.context.request, {
      action: "bind_managed_website",
      businessId: workspaceIds[3],
      tenantId: tenantIds[0]!,
      idempotencyKey: `wrong-business-${shortId()}`,
    }, 403);

    const ownerPage = await owner.context.newPage();
    await ownerPage.goto(`/workspace?workspaceId=${workspaceIds[0]}`, { waitUntil: "domcontentloaded" });
    await waitForAssignment(ownerPage, "Local Owner Business");
    const ownerAssignment = ownerPage.waitForResponse((response) => response.url().endsWith("/api/offerings/websites") && response.request().method() === "POST");
    await ownerPage.getByRole("button", { name: "Assign Local Owner Website to Local Owner Business", exact: true }).click();
    const ownerAssignmentResponse = await ownerAssignment;
    expect(ownerAssignmentResponse.status(), await ownerAssignmentResponse.text()).toBe(200);
    await expect(ownerPage.getByRole("button", { name: "Assign Local Owner Website to Local Owner Business", exact: true })).toHaveCount(0);
    await expect(ownerPage.getByRole("button", { name: "Assign Local Retry Website to Local Owner Business", exact: true })).toBeVisible();
    await expect(ownerPage.getByRole("region", { name: "Your business and work" }).getByRole("button", { name: "Open Local Owner Website", exact: true })).toBeVisible();

    await ownerPage.goto(`/workspace?workspaceId=${workspaceIds[0]}&view=settings`, { waitUntil: "domcontentloaded" });
    await expect(ownerPage.getByRole("heading", { name: "Business information", exact: true })).toBeVisible();
    await expect(ownerPage.getByRole("heading", { name: "Local Owner Website", exact: true })).toBeVisible();
    await expect(ownerPage.getByRole("link", { name: /Website profile/ })).toHaveAttribute("href", new RegExp(`/client/${tenantIds[0]}/dashboard/settings#profile$`));
    await expect(ownerPage.getByRole("link", { name: /Connections/ })).toHaveAttribute("href", new RegExp(`/client/${tenantIds[0]}/dashboard/integrations$`));
    await expect(ownerPage.getByRole("link", { name: /Domains/ })).toHaveAttribute("href", new RegExp(`/client/${tenantIds[0]}/dashboard/settings#domains$`));
    await expect(ownerPage.getByRole("link", { name: /Subscription/ })).toHaveAttribute("href", new RegExp(`/client/${tenantIds[0]}/dashboard/settings#plan$`));

    // The administrator path uses the same customer-facing Settings handoff.
    const adminPage = await administrator.context.newPage();
    await adminPage.goto(`/workspace?workspaceId=${workspaceIds[1]}&view=settings`, { waitUntil: "domcontentloaded" });
    await waitForAssignment(adminPage, "Local Admin Business");
    const adminAssignment = adminPage.waitForResponse((response) => response.url().endsWith("/api/offerings/websites") && response.request().method() === "POST");
    await adminPage.getByRole("button", { name: "Assign Local Admin Website to Local Admin Business", exact: true }).click();
    expect((await adminAssignment).status()).toBe(200);
    await expect(adminPage.getByTestId("website-assignment-handoff")).toHaveCount(0);
    await expect(adminPage.getByRole("heading", { name: "Local Admin Website", exact: true })).toBeVisible();

    // Repeating the exact customer-facing command returns the original
    // binding instead of creating a second attachment.
    const retryKey = `exact-retry-${shortId()}`;
    const firstRetry = await postWebsiteCommand(owner.context.request, {
      action: "bind_managed_website",
      businessId: workspaceIds[2],
      tenantId: tenantIds[2],
      idempotencyKey: retryKey,
    });
    const secondRetry = await postWebsiteCommand(owner.context.request, {
      action: "bind_managed_website",
      businessId: workspaceIds[2],
      tenantId: tenantIds[2],
      idempotencyKey: retryKey,
    });
    expect(firstRetry.websiteBinding).toMatchObject({ status: "active", tenantId: tenantIds[2] });
    expect(secondRetry.websiteBinding?.id).toBe(firstRetry.websiteBinding?.id);
    const retryCollection = await getOfferings(owner.context.request, workspaceIds[2]);
    expect((retryCollection.websiteBindings as Array<{ id: string }>).filter((binding) => binding.id === firstRetry.websiteBinding?.id)).toHaveLength(1);

    await closeContext(memberPage);
    await closeContext(ownerPage);
  } finally {
    await closeContext(owner?.context);
    await closeContext(administrator?.context);
    await closeContext(member?.context);
    await closeContext(stranger?.context);
    await bestEffortCleanup(adminDb, workspaceIds, tenantIds, [owner, administrator, member, stranger].filter((value): value is LocalIdentity => Boolean(value)));
  }
});
