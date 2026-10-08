import { expect, test } from "@playwright/test";

for (const width of [1280, 390]) {
  test(`business record and native mapping controls at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/preview/strelva/publishing?kind=record&state=native_pending");
    await page.getByLabel("Service price 1", { exact: true }).fill("$90");
    await page.getByLabel("Time zone", { exact: true }).focus();
    await expect(page.getByLabel("Time zone", { exact: true })).toBeFocused();
    await page.getByRole("button", { name: "Add opening period", exact: true }).click();
    await expect(page.getByRole("status")).toHaveCount(0);
    await page.getByRole("button", { name: "Save hours, services and website", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Saved to your business record");
    await expect(page.getByRole("status")).toContainText("An existing website draft needs review first");
    await expect(page.getByRole("status")).toContainText("Your live website is unchanged");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`business-facts-${width}.png`), fullPage: true });

    await page.goto("/preview/strelva/publishing?kind=mappings");
    await page.getByLabel("Website to configure", { exact: true }).selectOption("fictional-firm");
    await expect(page.getByLabel("Business name", { exact: true })).not.toBeChecked();
    await page.getByLabel("Business name", { exact: true }).check();
    await page.getByRole("button", { name: "Pair a service", exact: true }).click();
    await expect(page.getByLabel("Business service 1", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Website service 1", { exact: true })).toHaveValue("");
    await page.getByLabel("Business service 1", { exact: true }).selectOption("5e000000-0000-4000-8000-000000000020");
    await page.getByLabel("Website service 1", { exact: true }).selectOption("consultation-private");
    await page.getByLabel("Price", { exact: true }).check();
    await page.getByRole("button", { name: "Save website fact settings", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Nothing was published");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`website-fact-settings-${width}.png`), fullPage: true });
  });
}

test("mobile conflict, empty, permission and loading preserve truthful states", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/preview/strelva/publishing?kind=record&state=conflict");
  await page.getByLabel("Service price 1", { exact: true }).fill("$95");
  await page.getByRole("button", { name: "Save hours, services and website", exact: true }).click();
  await expect(page.getByRole("region", { name: "Hours, services and website from your record", exact: true }).getByRole("alert")).toContainText("Your edits are kept");
  await expect(page.getByLabel("Service price 1", { exact: true })).toHaveValue("$95");
  await page.screenshot({ path: testInfo.outputPath("business-facts-conflict-mobile.png"), fullPage: true });
  await page.goto("/preview/strelva/publishing?kind=record&state=read_only");
  await expect(page.getByLabel("Service name 1", { exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save hours, services and website", exact: true })).toHaveCount(0);
  await page.goto("/preview/strelva/publishing?kind=record&state=empty");
  await expect(page.getByText("Hours have not been recorded yet.", { exact: true })).toBeVisible();
  await expect(page.getByText("No services have been recorded yet.", { exact: true })).toBeVisible();
  await page.goto("/preview/strelva/publishing?kind=mappings&state=loading");
  await page.getByLabel("Website to configure", { exact: true }).selectOption("fictional-firm");
  await expect(page.getByRole("status")).toContainText("Loading website fact settings");
  await page.goto("/preview/strelva/publishing?kind=mappings&state=conflict");
  await page.getByLabel("Website to configure", { exact: true }).selectOption("fictional-firm");
  await page.getByLabel("Business name", { exact: true }).check();
  await page.getByRole("button", { name: "Save website fact settings", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Your choices are kept" })).toHaveCount(1);
  await expect(page.getByLabel("Business name", { exact: true })).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
