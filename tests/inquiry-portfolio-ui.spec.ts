import { expect, test } from "@playwright/test";

test.skip(process.env.STRELVA_UI_PREVIEW !== "1", "Requires the explicit development-only interface preview.");

test("attention opens the selected draft without losing preview work", async ({ page }) => {
  await page.goto("/preview/strelva/inquiries");
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByLabel("What should Strelva handle?").fill("Collect quote requests for repairs");
  await page.getByRole("button", { name: "Shape this request" }).click();
  await page.getByRole("button", { name: "Go with this shape" }).click();
  await page.getByRole("button", { name: "Home", exact: true }).first().click();
  await page.getByRole("button", { name: "Needs you across businesses" }).click();
  await expect(page.getByRole("heading", { name: "One business decision at a time." })).toBeVisible();
  await page.getByRole("link", { name: "Open this work" }).click();
  await expect(page.getByLabel("Form title", { exact: true })).toBeVisible();
});

test("a copied pattern uses the chosen staff and needs its own rehearsal", async ({ page }) => {
  await page.goto("/preview/strelva/inquiries");
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByLabel("What should Strelva handle?").fill("Collect seller inquiries and follow up");
  await page.getByRole("button", { name: "Shape this request" }).click();
  await page.getByRole("button", { name: "Go with this shape" }).click();
  await page.getByRole("button", { name: "Review rehearsal" }).click();
  await page.getByRole("button", { name: "Run rehearsal", exact: true }).click();
  await page.getByRole("button", { name: "Make live", exact: true }).click();
  await page.getByRole("button", { name: "Work", exact: true }).click();
  await page.getByRole("button", { name: "Home", exact: true }).first().click();
  await page.getByRole("button", { name: "Reuse an inquiry pattern" }).click();
  await expect(page.getByText(/Source: Buffalo Realty/)).toBeVisible();
  await page.getByLabel("Destination for Buffalo Realty").fill("team@example.test");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await page.locator("main").boundingBox())!.width).toBeGreaterThan(350);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "output/inquiry-pattern-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Copy to this business" }).click();
  await expect(page.getByRole("main")).toContainText("team@example.test");
  await expect(page.getByRole("main")).toContainText(/shape|rehearsal/i);
  await expect(page.getByRole("button", { name: "Make live", exact: true })).toHaveCount(0);
});
