import { expect, test } from "@playwright/test";

test.skip(process.env.STRELVA_UI_PREVIEW !== "1", "Requires isolated local interface fixtures.");

const navigation = (page: import("@playwright/test").Page) => page.getByRole("complementary", { name: "Strelva navigation", exact: true });

test("request-first Home opens saved work on desktop and mobile", async ({ page }, info) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 960 });
    await page.goto("/preview/strelva?scenario=free");
    await expect(page.getByRole("list", { name: "At a glance", exact: true })).toBeVisible();
    const composer = page.getByLabel("What do you want to accomplish?", { exact: true });
    await expect(composer).toBeVisible();
    expect((await composer.boundingBox())!.y).toBeLessThan(400);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`home-${width}.png`), fullPage: true });
    await page.getByRole("button", { name: "Open Harbor Dental", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Harbor Dental", exact: true })).toBeVisible();
  }
});

test("empty and read-only Home retain their permitted actions", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=empty");
  await expect(page.getByRole("region", { name: "Your work", exact: true }).getByRole("button", { name: "Browse examples", exact: true })).toBeVisible();
  await navigation(page).getByRole("button", { name: "New", exact: true }).click();
  await expect(page.getByLabel("What do you want to accomplish?")).toBeVisible();
  await page.goto("/preview/strelva?scenario=read-only");
  await expect(page.getByText("Shared with you", { exact: true })).toBeVisible();
  await expect(navigation(page).getByRole("button", { name: "New", exact: true })).toBeDisabled();
  await expect(page.getByLabel("What do you want to accomplish?", { exact: true })).toHaveCount(0);
  await navigation(page).getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Linked website access is unavailable right now. No business setting was changed.");
  await expect(page.getByText("No managed website is linked", { exact: false })).toHaveCount(0);
  for (const name of ["Business information", "People and access", "Work"]) await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Domains|Connections|Subscription/ })).toHaveCount(0);
});

test("Home retains useful controls with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/preview/strelva?scenario=free");
  await expect(page.getByRole("button", { name: "Open Harbor Dental", exact: true })).toBeVisible();
  await expect(page.getByLabel("What do you want to accomplish?", { exact: true })).toBeVisible();
});

test("unavailable workspace does not present stale work as ready", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=unavailable");
  await expect(page.getByText(/Saved work is unavailable right now/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Harbor Dental", exact: true })).toHaveCount(0);
});

test("Home search retains its query and request review retains the owner's words", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=free");
  await navigation(page).getByRole("button", { name: "Search", exact: true }).click();
  const search = page.getByRole("combobox", { name: /Search/ });
  await search.fill("no matching work");
  await expect(page.getByText("No matching work", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await navigation(page).getByRole("button", { name: "Search", exact: true }).click();
  await expect(search).toHaveValue("no matching work");
  await search.fill("Harbor");
  await expect(page.getByRole("option", { name: /Harbor Dental/ })).toBeVisible();
  await page.keyboard.press("Escape");
  const goal = "Create an equipment request application for my team";
  await page.getByLabel("What do you want to accomplish?", { exact: true }).fill(goal);
  await page.getByRole("button", { name: "Continue with this request", exact: true }).click();
  await expect(page.getByLabel("What do you want to accomplish?", { exact: true })).toHaveValue(goal);
  await page.getByRole("button", { name: "Prepare a plan", exact: true }).click();
  await expect(page.getByLabel("The result you want", { exact: true })).toHaveValue(goal);
});

for (const start of ["home", "new"]) test(`${start} carries the full multi-part request into plan review`, async ({ page }) => {
  await page.goto(start === "home" ? "/preview/strelva?scenario=business" : "/preview/strelva/workspace?scenario=business&view=start");
  const request = "Build a staff request app and turn our supplier spreadsheet into a tracker.";
  await page.getByLabel("What do you want to accomplish?", { exact: true }).fill(request);
  await page.getByRole("button", { name: "Continue with this request", exact: true }).click();
  await expect(page.getByRole("heading", { name: "A plan that keeps the whole request", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Prepare a plan", exact: true }).click();
  await expect(page.getByLabel("The result you want", { exact: true })).toHaveValue(request);
  await expect(page.getByText("Preview only. Planning runs in a signed-in workspace.", { exact: true })).toBeVisible();
});

test("Home keeps decisions, allowance, business switching and site assignment reachable", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=business");
  await expect(page.getByRole("list", { name: "At a glance", exact: true })).toContainText("Nothing needs you");
  await page.getByText("Usage and connected services", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Work allowance", exact: true })).toBeVisible();
  await expect(page.getByText("Cap needs your acceptance.", { exact: true })).toBeVisible();
  await page.getByText(/Websites available to your account/).click();
  await expect(page.getByRole("button", { name: "Assign Harbor Dental to Harbor Dental", exact: true })).toBeVisible();
  const picker = page.getByLabel("Current workspace", { exact: true });
  await expect(picker).toHaveValue("33333333-3333-4333-8333-333333333333");
  await picker.selectOption("11111111-1111-4111-8111-111111111111");
  await expect(picker).toHaveValue("11111111-1111-4111-8111-111111111111");
  await picker.selectOption("33333333-3333-4333-8333-333333333333");
  await page.getByRole("button", { name: "Open Harbor Dental", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Harbor Dental", exact: true })).toBeVisible();
  await navigation(page).getByRole("link", { name: "Home", exact: true }).click();
  await page.getByText("Usage and connected services", { exact: true }).click();
  await page.getByRole("button", { name: "Open Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
});

test("the same navigation remains across primary surfaces and utilities", async ({ page }, info) => {
  await page.goto("/preview/strelva?scenario=free");
  for (const label of ["Home", "Work", "Ongoing", "Settings", "People & access", "Examples", "Help"]) {
    await navigation(page).getByRole("link", { name: label, exact: true }).click();
    await expect(navigation(page).getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
    for (const name of ["Home", "Work", "Ongoing", "People & access", "Settings"]) await expect(navigation(page).getByRole("link", { name, exact: true })).toBeVisible();
  }
  await navigation(page).getByRole("link", { name: "Settings", exact: true }).click();
  await page.screenshot({ path: info.outputPath("desktop-settings.png"), fullPage: true });
});

test("mobile navigation traps focus and opens search without background interaction", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/preview/strelva?scenario=business");
  const trigger = page.getByRole("button", { name: "Open navigation", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Strelva workspace navigation", exact: true });
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 24; i += 1) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  }
  await page.screenshot({ path: info.outputPath("mobile-navigation.png") });
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await navigation(page).getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("combobox", { name: /Search/ })).toBeFocused();
  await page.keyboard.press("Escape");
  await trigger.click();
  await navigation(page).getByRole("link", { name: "Examples", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Make it yours.", exact: true })).toBeVisible();
  await page.getByText("More tools and managed services", { exact: true }).click();
  await page.getByRole("button", { name: "Assign to this business", exact: true }).click();
  await expect(page.getByText("Assigned to this business · You can open it", { exact: true })).toBeVisible();
  await trigger.click();
  await navigation(page).getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Subscription/ })).toHaveAttribute("href", "/preview/strelva/website/dashboard/settings#plan");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("mobile-settings.png"), fullPage: true });
});
