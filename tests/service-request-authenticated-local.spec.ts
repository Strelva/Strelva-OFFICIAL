import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { localEnvironment, signedInContext } from "./support/local-auth";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires an isolated local Supabase Auth and Postgres stack.");
test.setTimeout(120_000);

test("persists, reopens, and reviews a service request through local Auth and Postgres", async ({ browser }) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, "service-request-owner");
  const agency = await signedInContext(browser, admin, "service-request-agency");
  const businessId = randomUUID();
  const agencyId = randomUUID();
  const agencyName = "North Studio Local";
  let customerPage: Awaited<ReturnType<typeof owner.context.newPage>> | undefined;
  let agencyPage: Awaited<ReturnType<typeof agency.context.newPage>> | undefined;

  try {
    expect((await admin.from("workspaces").insert([
      { id: businessId, kind: "customer", name: "Harbor Local", created_by: owner.userId },
      { id: agencyId, kind: "agency", name: agencyName, created_by: agency.userId },
    ])).error).toBeNull();
    expect((await admin.from("workspace_memberships").insert([
      { workspace_id: businessId, user_id: owner.userId, role: "owner", created_by: owner.userId },
      { workspace_id: agencyId, user_id: agency.userId, role: "owner", created_by: agency.userId },
      // The customer account can select only agency workspaces present in its
      // server-authored snapshot. The agency owner remains the actual provider.
      { workspace_id: agencyId, user_id: owner.userId, role: "member", created_by: agency.userId },
    ])).error).toBeNull();

    expect((await owner.context.request.get(`/api/workspace?workspaceId=${encodeURIComponent(businessId)}`)).status()).toBe(200);
    customerPage = await owner.context.newPage();
    customerPage.setDefaultTimeout(20_000);
    await customerPage.goto(`/workspace?workspaceId=${encodeURIComponent(businessId)}&view=help`, { waitUntil: "domcontentloaded" });
    await expect(customerPage.getByRole("heading", { name: "What do you need?", exact: true })).toBeVisible();
    const provider = customerPage.getByLabel("Who should review this?", { exact: true });
    await expect(provider.locator("option")).toHaveText(["Strelva", agencyName]);
    await provider.selectOption({ label: agencyName });
    await customerPage.getByLabel("What are you trying to do?", { exact: true }).fill("Prepare a private request flow.");

    const firstSave = customerPage.waitForResponse((response) => response.url().includes("/api/service-requests") && response.request().method() === "POST");
    await customerPage.getByRole("button", { name: "Save request", exact: true }).click();
    const firstSaveResponse = await firstSave;
    expect(firstSaveResponse.status()).toBe(200);
    const firstBody = await firstSaveResponse.json() as { request: Record<string, unknown> };
    const first = firstBody.request;
    expect(first).toMatchObject({ businessId, status: "requested", revision: 1, provider: { kind: "agency", agencyWorkspaceId: agencyId }, providerAcceptance: { status: "pending" } });
    expect(first.context).toMatchObject({ source: "workspace_help", workspaceName: "Harbor Local" });
    expect(first.scope).toEqual(["help_request"]);
    await expect(customerPage.getByText(/Saved for review\./)).toBeVisible();

    const savedRow = customerPage.locator("ul button").filter({ hasText: "Pending provider review" }).first();
    await expect(savedRow).toContainText(agencyName);
    await savedRow.click();
    await customerPage.getByLabel("What are you trying to do?", { exact: true }).fill("Revise the private request flow.");
    const editSave = customerPage.waitForResponse((response) => response.url().includes("/api/service-requests") && response.request().method() === "POST");
    await customerPage.getByRole("button", { name: "Save request", exact: true }).click();
    const editResponse = await editSave;
    expect(editResponse.status()).toBe(200);
    const edited = (await editResponse.json() as { request: Record<string, unknown> }).request;
    expect(edited).toMatchObject({ id: first.id, revision: 2, provider: { kind: "agency", agencyWorkspaceId: agencyId }, providerAcceptance: { status: "pending" } });
    expect(edited.context).toEqual(first.context);
    expect(edited.scope).toEqual(first.scope);

    agencyPage = await agency.context.newPage();
    agencyPage.setDefaultTimeout(20_000);
    await agencyPage.goto(`/workspace?workspaceId=${encodeURIComponent(agencyId)}`, { waitUntil: "domcontentloaded" });
    await expect(agencyPage.getByRole("heading", { name: "Service requests", exact: true })).toBeVisible();
    await expect(agencyPage.getByText("Revise the private request flow.", { exact: true })).toBeVisible();
    const staleAccept = agencyPage.getByRole("button", { name: "Accept for review", exact: true });

    // Move the customer to revision 3 while the provider still holds revision 2.
    await savedRow.click();
    await customerPage.getByLabel("What are you trying to do?", { exact: true }).fill("Clarify the private request flow.");
    const thirdSave = customerPage.waitForResponse((response) => response.url().includes("/api/service-requests") && response.request().method() === "POST");
    await customerPage.getByRole("button", { name: "Save request", exact: true }).click();
    const thirdResponse = await thirdSave;
    expect(thirdResponse.status()).toBe(200);
    expect((await thirdResponse.json() as { request: Record<string, unknown> }).request).toMatchObject({ id: first.id, revision: 3, providerAcceptance: { status: "pending" } });

    await staleAccept.click();
    await expect(agencyPage.locator('p[role="alert"]')).toContainText("could not be confirmed");
    const afterStaleReview = await owner.context.request.get(`/api/service-requests?businessId=${encodeURIComponent(businessId)}`);
    expect(afterStaleReview.status()).toBe(200);
    expect((await afterStaleReview.json()).requests).toEqual([
      expect.objectContaining({ id: first.id, revision: 3, providerAcceptance: expect.objectContaining({ status: "pending" }) }),
    ]);

    await agencyPage.getByRole("button", { name: "Check again", exact: true }).click();
    await expect(agencyPage.getByText("Clarify the private request flow.", { exact: true })).toBeVisible();
    await agencyPage.getByRole("button", { name: "Accept for review", exact: true }).click();
    await expect(agencyPage.getByText("Accepted for review. No installation, price, authority, or execution was created.", { exact: true })).toBeVisible();
    await expect(agencyPage.getByText("No pre-installation service requests are waiting for provider review.", { exact: true })).toBeVisible();

    await customerPage.reload({ waitUntil: "domcontentloaded" });
    await expect(customerPage.locator("ul button").first()).toContainText("Accepted for review");
    await expect(customerPage.locator("ul button").first()).toContainText(agencyName);
  } finally {
    await agencyPage?.close();
    await customerPage?.close();
    // Remove the customer first so its request rows cascade before the
    // provider workspace's restrict FK is removed.
    await admin.from("workspaces").delete().eq("id", businessId);
    await admin.from("workspaces").delete().eq("id", agencyId);
    await admin.auth.admin.deleteUser(owner.userId).catch(() => {});
    await admin.auth.admin.deleteUser(agency.userId).catch(() => {});
    await owner.context.close();
    await agency.context.close();
  }
});
