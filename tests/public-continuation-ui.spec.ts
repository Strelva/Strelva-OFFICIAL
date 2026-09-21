import { expect, test } from "@playwright/test";

test.skip(process.env.STRELVA_UI_PREVIEW !== "1", "Requires the explicit development-only interface preview.");

test("retained public brief names its context and only writable destinations", async ({ page }) => {
  await page.goto("/preview/strelva/workspace/account?state=continuation", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Continue “Give every inquiry a next step.”" })).toBeVisible();
  await expect(page.getByText("We keep forgetting to follow up with people who request quotes.")).toBeVisible();
  await expect(page.getByText("Harbor Dental", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Signed in as morgan@example\.test/)).toBeVisible();
  await expect(page.getByLabel("Save to")).toHaveValue("11111111-1111-4111-8111-111111111111");
  await expect(page.getByLabel("Save to").locator("option")).toHaveCount(2);
  await expect(page.getByLabel("Save to")).not.toContainText("Harbor Dental");
  await expect(page.getByText("file contents were not uploaded")).toBeVisible();
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole("button", { name: "Save private brief" })).toBeVisible();
  }
});
