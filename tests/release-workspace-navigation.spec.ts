import { expect, test } from "@playwright/test";

test.skip(process.env.STRELVA_UI_PREVIEW !== "1", "Requires isolated UI fixtures.");

test("skip-to-work moves keyboard focus beyond navigation", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=business");
  await expect(page.getByLabel("What do you want to accomplish?", { exact: true })).toBeEnabled();
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
  await expect(page.getByLabel("What do you want to accomplish?", { exact: true })).toBeEnabled();
  const menu = page.getByRole("button", { name: "Open navigation", exact: true });
  await expect(menu).toBeVisible();
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
  await expect(page.getByRole("button", { name: "Preview Staff requests", exact: true })).toBeVisible();
  for (const control of await page.locator("header button:visible, header a:visible, header select:visible").all()) {
    const box = await control.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.close();
});


for (const width of [1440, 390]) {
  test(`System → switch business → reload → Back/Forward at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const business = "a0000000-0000-4000-8000-000000000001";
    const other = "a0000000-0000-4000-8000-000000000002";
    const system = "25a9f92f-8b61-4a2b-bdf5-206402957690";
    await page.goto(`/preview/strelva?scenario=agency-systems&systems=on&workspaceId=${business}&view=system&system=${system}`);
    await expect(page.getByRole("heading", { name: "Mediation intake", exact: true }).first()).toBeVisible();
    await expect(page.getByText("The Mooney Firm shared this with your agency to review.", { exact: true })).toBeVisible();
    if (width < 768) await page.getByRole("button", { name: "Open navigation", exact: true }).click();
    await page.getByRole("combobox", { name: "Current workspace", exact: true }).selectOption(other);
    await expect(page).toHaveURL(new RegExp(`workspaceId=${other}`));
    await expect.poll(() => new URL(page.url()).searchParams.has("system")).toBe(false);
    await expect.poll(() => new URL(page.url()).searchParams.has("view")).toBe(false);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Review what was shared.", exact: true })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`system=${system}`));
    await expect(page.getByRole("heading", { name: "Mediation intake", exact: true }).first()).toBeVisible();
    await page.goForward();
    await expect(page).toHaveURL(new RegExp(`workspaceId=${other}`));
    await expect.poll(() => new URL(page.url()).searchParams.has("system")).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`workspace-switch-${width}.png`), fullPage: true });
  });
}


for (const width of [1440, 390]) {
  test(`location reads preserve empty/loading/error/permission presentation at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    for (const [scenario, text] of [
      ["mooney-empty", "Nothing is running yet."],
      ["mooney-loading", "Checking your work…"],
      ["mooney-error", "Requests waiting on your decision could not be checked."],
    ] as const) {
      await page.goto(`/preview/strelva?scenario=${scenario}&systems=on`);
      await expect(page.getByText(text).first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`${scenario}-${width}.png`), fullPage: true });
    }
    await page.goto("/preview/strelva?scenario=agency-systems&systems=on&workspaceId=a0000000-0000-4000-8000-000000000001&view=system&system=25a9f92f-8b61-4a2b-bdf5-206402957690");
    await expect(page.getByRole("button", { name: "Ask for a change", exact: true })).toBeDisabled();
    await page.goto("/preview/strelva?scenario=mooney&systems=on&workspaceId=a0000000-0000-4000-8000-000000000001&view=system&system=00000000-0000-4000-8000-00000000dead");
    await expect(page.getByRole("heading", { name: "This system isn’t available here.", exact: true })).toBeVisible();
  });
}
