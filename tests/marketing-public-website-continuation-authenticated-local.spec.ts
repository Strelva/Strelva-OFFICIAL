import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { localEnvironment, signedInContext } from "./support/local-auth";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires isolated local Supabase and real local Auth.");
test.setTimeout(120_000);

test("the public website brief crosses the marketing origin, Auth return, and owned website draft", async ({ browser }) => {
  const env = localEnvironment();
  const marketingApp = process.env.STRELVA_MARKETING_BASE_URL || "";
  if (!marketingApp || !["localhost", "127.0.0.1"].includes(new URL(marketingApp).hostname)) throw new Error("This proof requires a loopback marketing origin.");
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, "marketing-public-website-owner");
  const marketing = await browser.newContext({ baseURL: marketingApp, viewport: { width: 390, height: 844 } });
  let workspaceId = "";

  try {
    const publicPage = await marketing.newPage();
    await publicPage.goto("/", { waitUntil: "domcontentloaded" });
    await publicPage.getByRole("button", { name: "Bring your website up to date", exact: true }).click();
    await publicPage.getByRole("button", { name: "Use this starting point", exact: true }).click();
    await publicPage.getByRole("button", { name: "Explore this change", exact: true }).click();
    await publicPage.getByRole("button", { name: "What we offer", exact: true }).click();
    await publicPage.getByRole("button", { name: "Prepare this work", exact: true }).click();

    const continuation = publicPage.waitForResponse(response => response.url().endsWith("/api/public-continuation") && response.request().method() === "POST");
    await publicPage.getByRole("button", { name: "Save to your account", exact: true }).click();
    expect((await continuation).status()).toBe(200);
    await expect(publicPage).toHaveURL(/\/sign-in\?next=%2Fworkspace%2Faccount%3Fcontinue%3Dpublic$/);

    const retained = (await marketing.cookies()).filter(cookie => cookie.name === "strelva_public_continuation");
    expect(retained).toHaveLength(1);
    await owner.context.addCookies(retained);
    const page = await owner.context.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/workspace/account?continue=public");
    await expect(page.getByText(/Bring the website up to date with the business/)).toBeVisible();
    workspaceId = await page.getByLabel("Save to", { exact: true }).inputValue();

    const createResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/websites" && response.request().method() === "POST");
    await page.getByRole("button", { name: "Start website draft", exact: true }).click();
    const createdResponse = await createResponse;
    expect(createdResponse.status(), await createdResponse.text()).toBe(201);
    const created = await createdResponse.json() as { workId: string; workspaceId: string; website: { brief: { description: string }; status: string } };
    expect(created.workspaceId).toBe(workspaceId);
    expect(created.website.status).toBe("preview_ready");
    expect(created.website.brief.description).toContain("Our website doesn’t reflect what the company is anymore.");
    await expect(page).toHaveURL(new RegExp(`/workspace\\?workspaceId=${workspaceId}.*view=websites.*work=${created.workId}`));
    await expect(page.getByLabel("Business name", { exact: true })).toHaveValue("My business");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: "/tmp/strelva-marketing-public-website-mobile.png", fullPage: true });
  } finally {
    await marketing.close();
    await owner.context.close();
    if (workspaceId) await admin.from("workspaces").delete().eq("id", workspaceId);
    await admin.auth.admin.deleteUser(owner.userId).catch(() => undefined);
  }
});
