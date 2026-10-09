import { expect, test } from "@playwright/test";

test.skip(process.env.STRELVA_UI_PREVIEW !== "1", "Requires isolated UI fixtures.");

test("skip-to-work moves keyboard focus beyond navigation", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=business");
  const skip = page.getByRole("link", { name: "Skip to work", exact: true });
  // The development-only scenario selector precedes the product's first
  // control. Start at the same skip link used by the production frame.
  await skip.focus();
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("What do you want to accomplish?", { exact: true })).toBeFocused();
});

test("browser Back returns template focus to its list trigger", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=business&view=products");
  const card = page.getByRole("button", { name: "Preview Staff requests", exact: true });
  await card.click();
  await expect(page.getByRole("heading", { name: "Staff requests", exact: true }).first()).toBeFocused();
  await page.goBack();
  await expect(card).toBeFocused();
  await card.click();
  await expect(page.getByRole("heading", { name: "Staff requests", exact: true }).first()).toBeFocused();
  await page.getByRole("button", { name: "All templates", exact: true }).click();
  await expect(card).toBeFocused();
});

test("touch navigation keeps 44px targets and 320px reflow", async ({ browser }, info) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 800 }, hasTouch: true, isMobile: true, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/preview/strelva?scenario=business");
  const menu = page.getByRole("button", { name: "Open navigation", exact: true });
  expect((await menu.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await menu.click();
  const nav = page.getByRole("dialog", { name: "Strelva workspace navigation", exact: true });
  for (const name of ["Home", "Requests", "Running", "Business details", "All apps and files"]) {
    const box = await nav.getByRole("link", { name, exact: true }).boundingBox();
    expect(box!.height, name).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: info.outputPath("navigation-touch-320.png"), fullPage: true });
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await page.goto("/preview/strelva?scenario=business&view=products");
  for (const control of await page.locator("header button:visible, header a:visible, header select:visible").all()) {
    const box = await control.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.close();
});
