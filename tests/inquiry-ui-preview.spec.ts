import { expect, test } from "@playwright/test";

test.skip(process.env.STRELVA_UI_PREVIEW !== "1", "Requires the explicit development-only interface preview.");

test.describe("inquiry migration browser journey", () => {
  test("edits the actual form, rehearses and inspects the published after view", async ({ page }) => {
    await page.goto("/preview/strelva/inquiries");
    await page.getByRole("button", { name: "New", exact: true }).click();
    await page.getByLabel("What should Strelva handle?").fill("Collect seller inquiries and route them to Maria, with a follow-up if nobody replies.");
    await page.getByRole("button", { name: "Shape this request" }).click();
    await expect(page.getByRole("button", { name: "Go with this shape" })).toBeEnabled();
    await page.getByRole("button", { name: "Go with this shape" }).click();
    await page.getByLabel("Form title", { exact: true }).fill("Tell us about your home");
    await page.getByRole("button", { name: "Save preview changes" }).click();
    await page.getByRole("button", { name: "Review rehearsal" }).click();
    await page.getByRole("button", { name: "Run rehearsal", exact: true }).click();
    await expect(page.getByRole("heading", { name: "8 of 8 checks passed" })).toBeVisible();
    await page.getByRole("button", { name: "Make live", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Tell us about your home", exact: true })).toBeVisible();
    await expect(page.getByText("Read back exact definition from isolated fixture memory; no live website was changed.", { exact: true })).toBeVisible();
    await page.locator("main").evaluate((element) => { element.scrollTop = 0; });
    await page.screenshot({ path: "output/inquiry-receipt-desktop-verified.png", fullPage: true });
    await page.getByRole("link", { name: "Work", exact: true }).click();
    await page.getByRole("button", { name: "Review rehearsal" }).click();
    await page.getByRole("button", { name: "Send test inquiry", exact: true }).click();
    await expect(page.getByRole("main")).toContainText("Rehearsal customer");
    await expect(page.getByText("The customer submitted the inquiry form.", { exact: true }).first()).toBeVisible();
  });

  test("business home keeps four ordered sections and a narrow sidebar", async ({ page }) => {
    await page.goto("/preview/strelva/inquiries");
    await expect(page.getByText("Nothing here is real.", { exact: true })).toBeVisible();
    const headings = await page.locator("main h2").allTextContents();
    expect(headings).toEqual(["Needs you", "Strelva is handling", "What changed", "What's live"]);
    const navigation = page.getByRole("navigation", { name: "Inquiry work" });
    await expect(navigation.getByRole("button", { name: "New", exact: true })).toBeVisible();
    await expect(navigation.getByRole("button", { name: "Search", exact: true })).toBeVisible();
    await expect(navigation.getByText(/CRM|Marketing|Automations/)).toHaveCount(0);
  });

  test("mobile menu closes into a full-width usable request form", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/preview/strelva/inquiries");
    await page.getByRole("button", { name: "Open inquiry navigation" }).click();
    await page.getByRole("button", { name: "New", exact: true }).click();
    const input = page.getByLabel("What should Strelva handle?");
    await expect(input).toBeVisible();
    await input.fill("Collect buyer inquiries and route them to Maria.");
    await expect(page.getByRole("button", { name: "Shape this request" })).toBeEnabled();
    await expect.poll(async () => (await page.locator("main").boundingBox())!.x).toBeLessThan(24);
    await expect.poll(async () => (await page.locator("main").boundingBox())!.width).toBeGreaterThan(350);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.screenshot({ path: "output/inquiry-new-mobile-verified.png", fullPage: true });
  });

  test("read-only and unavailable states do not enable mutations or show fake customers", async ({ page }) => {
    await page.goto("/preview/strelva/inquiries?scenario=read-only&view=new");
    await expect(page.getByLabel("What should Strelva handle?")).toBeDisabled();
    await page.goto("/preview/strelva/inquiries?scenario=unavailable");
    await expect(page.getByRole("main")).toContainText(/unavailable|could not be loaded/i);
    await expect(page.getByRole("button", { name: "Make live", exact: true })).toHaveCount(0);
  });
});
