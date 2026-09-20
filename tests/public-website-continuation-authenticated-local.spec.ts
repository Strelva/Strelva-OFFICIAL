import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { localEnvironment, signedInContext } from "./support/local-auth";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires isolated local Supabase and real local Auth.");
test.setTimeout(120_000);

test("a confirmed public brief can start one owned website draft after Auth", async ({ browser }) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, "public-website-owner");
  const anonymous = await browser.newContext({ baseURL: env.app, viewport: { width: 390, height: 844 } });
  const continuationId = randomUUID();
  const request = `Build a clearer appointment website ${continuationId}`;
  let workspaceId = "";

  try {
    const intake = await anonymous.request.post("/api/public-continuation", {
      headers: { origin: env.app },
      data: {
        version: 1,
        id: continuationId,
        businessName: "Juniper Dental",
        request,
        result: "Visitors know how to request an appointment.",
        resultTitle: "A clearer appointment path",
        scope: "A focused homepage draft reviewed before publication.",
        review: true,
        fileNames: ["services.pdf"],
      },
    });
    expect(intake.status(), await intake.text()).toBe(200);
    const retained = (await anonymous.cookies()).filter(cookie => cookie.name === "strelva_public_continuation");
    expect(retained).toHaveLength(1);
    await owner.context.addCookies(retained);

    const page = await owner.context.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/workspace/account?continue=public");
    await expect(page.getByText(request, { exact: true })).toBeVisible();
    const destination = page.getByLabel("Save to", { exact: true });
    await expect(destination.locator("option")).toHaveCount(1);
    workspaceId = await destination.inputValue();

    const createResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/websites" && response.request().method() === "POST");
    await page.getByRole("button", { name: "Start website draft", exact: true }).click();
    const createdResponse = await createResponse;
    expect(createdResponse.status(), await createdResponse.text()).toBe(201);
    const created = await createdResponse.json() as { workId: string; workspaceId: string; website: { brief: { description: string }; status: string } };
    expect(created.workspaceId).toBe(workspaceId);
    expect(created.website.status).toBe("preview_ready");
    expect(created.website.brief.description).toBe(request);
    await expect(page).toHaveURL(new RegExp(`/workspace\\?workspaceId=${workspaceId}.*view=websites.*work=${created.workId}`));
    await expect(page.getByLabel("Business name", { exact: true })).toHaveValue("Juniper Dental");
    const preview = page.frameLocator('iframe[title="Generated website preview for Juniper Dental"]');
    await expect(preview.getByRole("heading", { name: /Juniper Dental/ }).first()).toBeVisible();
    await expect(preview.getByText(/appointment/).first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: "/tmp/strelva-public-website-continuation-mobile.png", fullPage: true });

    const persisted = await admin.from("saved_product_work").select("workspace_id,product_id,resource_kind,input,payload").eq("id", created.workId).single();
    expect(persisted.error).toBeNull();
    expect(persisted.data).toMatchObject({ workspace_id: workspaceId, product_id: "websites", resource_kind: "website" });
    expect(JSON.stringify(persisted.data?.payload)).toContain(request);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload();
    await expect(page.getByLabel("Business name", { exact: true })).toHaveValue("Juniper Dental");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: "/tmp/strelva-public-website-continuation-desktop.png", fullPage: true });
  } finally {
    await anonymous.close();
    await owner.context.close();
    if (workspaceId) await admin.from("workspaces").delete().eq("id", workspaceId);
    await admin.auth.admin.deleteUser(owner.userId).catch(() => undefined);
  }
});
