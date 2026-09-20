import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { localEnvironment, signedInContext } from "./support/local-auth";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires isolated local Auth and Postgres.");
test.setTimeout(180_000);

test("an owner publishes, shares, updates, and resumes the staff request offering", async ({ browser }, testInfo) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, "staff-offering-owner");
  const recipient = await signedInContext(browser, admin, "staff-offering-recipient");

  try {
    const workspaceId = randomUUID();
    const workspace = await admin.from("workspaces").insert({
      id: workspaceId,
      kind: "customer",
      name: "Harbor Plumbing",
      created_by: owner.userId,
    });
    expect(workspace.error).toBeNull();
    const membership = await admin.from("workspace_memberships").insert({
      workspace_id: workspaceId,
      user_id: owner.userId,
      role: "owner",
      created_by: owner.userId,
    });
    expect(membership.error).toBeNull();

    const page = await owner.context.newPage();
    page.setDefaultTimeout(20_000);
    await page.goto(`/workspace?workspaceId=${workspaceId}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Your business, at a glance.", exact: true })).toBeVisible();

    const navigation = page.getByRole("complementary", { name: "Strelva navigation", exact: true });
    await navigation.getByRole("button", { name: "Explore offerings", exact: true }).click();
    await expect(page.getByRole("heading", { name: "What this business can use.", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Staff request application/ }).click();
    await expect(page.getByRole("heading", { name: "Install Staff request application", exact: true })).toBeVisible();
    await expect(page.getByText("Create the standard staff request application", { exact: true })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Your business operates it", exact: true })).toBeChecked();

    await page.getByRole("button", { name: "Prepare offering", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`workspaceId=${workspaceId}.*work=`));
    const appId = new URL(page.url()).searchParams.get("work");
    expect(appId).toMatch(/^[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Staff requests", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Check proposed change", exact: true }).click();
    await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByText(/Version 1 is live/)).toBeVisible();

    // The offering stays in draft until the connected application is released
    // and the owner explicitly activates it.
    await navigation.getByRole("button", { name: "Home", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your business, at a glance.", exact: true })).toBeVisible();
    await navigation.getByRole("button", { name: "Explore offerings", exact: true }).click();
    await page.getByRole("button", { name: /Staff request application/ }).click();
    await expect(page.getByText("Draft setup", { exact: true })).toBeVisible();
    await page.getByLabel("I published the connected application through its review.", { exact: true }).check();
    await page.getByRole("button", { name: "Activate released offering", exact: true }).click();
    await expect(page.getByText("Installed", { exact: true })).toBeVisible();

    const connectedBeforeUse = page.getByRole("region", { name: "Connected work", exact: true });
    await expect(connectedBeforeUse.getByRole("button", { name: "Open Staff requests", exact: true })).toHaveCount(1);
    await connectedBeforeUse.getByRole("button", { name: "Open Staff requests", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`work=${appId}`));
    await expect(page.getByRole("heading", { name: "Staff requests", exact: true })).toBeVisible();

    await page.getByLabel("Recipient email", { exact: true }).fill(recipient.email);
    await page.getByRole("button", { name: "Issue access link", exact: true }).click();
    await expect(page.getByText(`Link for ${recipient.email}`, { exact: true })).toBeVisible();
    await expect(page.locator(`a[href="/apps/${appId}"]`)).toBeVisible();

    const staffPage = await recipient.context.newPage();
    staffPage.setDefaultTimeout(20_000);
    await staffPage.setViewportSize({ width: 390, height: 844 });
    await staffPage.goto(`/apps/${appId}`, { waitUntil: "domcontentloaded" });
    await expect(staffPage.getByRole("heading", { name: "Staff requests", exact: true })).toBeVisible();
    await staffPage.getByLabel("Request *", { exact: true }).fill("Replace the reception printer");
    await staffPage.getByRole("button", { name: "Submit record", exact: true }).click();
    await expect(staffPage.getByRole("status")).toContainText("Record submitted.");
    await expect(staffPage.getByText("Replace the reception printer", { exact: true })).toBeVisible();

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText("Replace the reception printer", { exact: true })).toBeVisible();
    await page.getByText("Edit proposed app", { exact: true }).click();
    await page.getByLabel("Label for Request", { exact: true }).fill("Request details");
    await page.getByRole("button", { name: "Save new draft", exact: true }).click();
    await expect(page.getByText(/label changes from "Request" to "Request details"/)).toBeVisible();
    await page.getByRole("button", { name: "Check proposed change", exact: true }).click();
    await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByText(/Version 2 is live/)).toBeVisible();
    await page.getByText("Add another record", { exact: true }).click();
    await expect(page.getByLabel("Request details", { exact: true })).toBeVisible();
    await expect(page.getByText("Replace the reception printer", { exact: true })).toBeVisible();

    await staffPage.reload({ waitUntil: "domcontentloaded" });
    await expect(staffPage.getByLabel("Request details *", { exact: true })).toBeVisible();
    await expect(staffPage.getByText("Replace the reception printer", { exact: true })).toBeVisible();
    await staffPage.screenshot({ path: testInfo.outputPath("staff-request-offering-mobile.png"), fullPage: true });

    await navigation.getByRole("button", { name: "Home", exact: true }).click();
    const recent = page.getByRole("region", { name: "Recent work", exact: true });
    await expect(recent.getByRole("button", { name: /Staff requests/ })).toBeVisible();
    await recent.getByRole("button", { name: /Staff requests/ }).click();
    await expect(page.getByRole("heading", { name: "Staff requests", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Back to work", exact: true }).click();
    await navigation.getByRole("button", { name: "Explore offerings", exact: true }).click();
    await page.getByRole("button", { name: /Staff request application/ }).click();
    const connected = page.getByRole("region", { name: "Connected work", exact: true });
    await expect(connected).toContainText("Staff requests");
    await expect(connected).not.toContainText(appId!);
    await connected.getByRole("button", { name: "Open Staff requests", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Staff requests", exact: true })).toBeVisible();
  } finally {
    await owner.context.close();
    await recipient.context.close();
  }
});
