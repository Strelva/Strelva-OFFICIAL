import { expect, test } from "@playwright/test";

test.skip(process.env.STRELVA_UI_PREVIEW !== "1", "Requires isolated local interface fixtures.");

test("illustrated Home opens saved work on desktop and mobile", async ({ page }, info) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 960 });
    await page.goto("/preview/strelva?scenario=free");
    const scene = page.getByTestId("strelva-business-illustration");
    await expect(scene).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`home-${width}.png`), fullPage: true });
    await page.getByRole("button", { name: "Open Harbor Dental", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Harbor Dental", exact: true })).toBeVisible();
  }
});

test("empty and read-only Home retain their permitted actions", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=empty");
  await expect(page.getByTestId("strelva-business-illustration")).toBeVisible();
  await page.getByRole("button", { name: "Start something new", exact: true }).click();
  await expect(page.getByLabel("What do you want to accomplish?")).toBeVisible();
  await page.goto("/preview/strelva?scenario=read-only");
  await expect(page.getByRole("heading", { name: "A look inside." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start something new", exact: true })).toHaveCount(0);
  await page.getByRole("complementary", { name: "Strelva navigation", exact: true }).getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Linked website access is unavailable right now. No business setting was changed.");
  await expect(page.getByText("No managed website is linked", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Business information", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "People and access", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Work", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Domains|Connections|Subscription/ })).toHaveCount(0);
});

test("Home keeps its structure when reduced motion is requested", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/preview/strelva?scenario=free");
  await expect(page.getByTestId("strelva-business-illustration")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Harbor Dental", exact: true })).toBeVisible();
  await expect(page.getByLabel("What would you like to work on today?", { exact: true })).toBeVisible();
});

test("unavailable workspace does not present stale work as ready", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=unavailable");
  await expect(page.getByText(/Saved work is unavailable right now/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Harbor Dental", exact: true })).toHaveCount(0);
});

test("Home search filters work and the request field carries the owner's words forward", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=free");
  await page.getByLabel("Find your work", { exact: true }).fill("no matching work");
  await expect(page.getByRole("status")).toContainText("No work matches");
  await expect(page.getByRole("button", { name: "Open Harbor Dental", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open Harbor Dental", exact: true })).toBeVisible();
  const goal = "Create an equipment request application for my team";
  await page.getByLabel("What would you like to work on today?", { exact: true }).fill(goal);
  await page.getByRole("button", { name: "Continue with this request", exact: true }).click();
  await expect(page.getByLabel("The result you want", { exact: true })).toHaveValue(goal);
});

test("the same business topology remains across primary surfaces and utilities", async ({ page }, info) => {
  await page.goto("/preview/strelva?scenario=free");
  const expected = ["Home", "Work", "Ongoing", "People & access", "Settings"];
  async function expectSidebar(active: string) {
    const sidebar = page.getByRole("complementary", { name: "Strelva navigation", exact: true });
    await expect(sidebar).toBeVisible();
    for (const label of expected) await expect(sidebar.getByRole("button", { name: label, exact: true })).toBeVisible();
    await expect(sidebar.getByRole("button", { name: active, exact: true })).toHaveAttribute("aria-current", "page");
  }
  await expectSidebar("Home");
  await page.getByRole("complementary", { name: "Strelva navigation", exact: true }).getByRole("button", { name: "Work", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My work", exact: true })).toBeVisible();
  await expectSidebar("Work");
  await page.getByRole("complementary", { name: "Strelva navigation", exact: true }).getByRole("button", { name: "Ongoing", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Work someone is looking after", exact: true })).toBeVisible();
  await expectSidebar("Ongoing");
  await page.getByRole("complementary", { name: "Strelva navigation", exact: true }).getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expectSidebar("Settings");
  await page.screenshot({ path: info.outputPath("desktop-settings.png"), fullPage: true });
  await page.getByRole("complementary", { name: "Strelva navigation", exact: true }).getByRole("button", { name: "People & access", exact: true }).click();
  await expect(page.getByText("People & access", { exact: true }).first()).toBeVisible();
  await expectSidebar("People & access");
  await page.getByRole("complementary", { name: "Strelva navigation", exact: true }).getByRole("button", { name: "Explore offerings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "More you can do.", exact: true })).toBeVisible();
  await expectSidebar("Explore offerings");
  await page.getByRole("complementary", { name: "Strelva navigation", exact: true }).getByRole("button", { name: "Help", exact: true }).click();
  await expect(page.getByRole("heading", { name: "What do you need?", exact: true })).toBeVisible();
  await expectSidebar("Help");
});

test("mobile navigation keeps primary surfaces and workspace utilities distinct", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/preview/strelva?scenario=business");
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  const sidebar = page.getByRole("complementary", { name: "Strelva navigation", exact: true });
  const main = sidebar.getByRole("navigation", { name: "Main", exact: true });
  for (const label of ["Home", "Work", "Ongoing", "People & access", "Settings"]) await expect(main.getByRole("button", { name: label, exact: true })).toBeVisible();
  const utilities = sidebar.getByLabel("Workspace utilities", { exact: true });
  for (const label of ["New", "Search", "Explore offerings", "Help"]) await expect(utilities.getByRole("button", { name: label, exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("mobile-navigation.png") });
  await utilities.getByRole("button", { name: "Search", exact: true }).click();
  await expect(sidebar).not.toBeVisible();
  await expect(page.getByLabel("Find your work", { exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await sidebar.getByLabel("Workspace utilities", { exact: true }).getByRole("button", { name: "Explore offerings", exact: true }).click();
  await page.getByRole("button", { name: "Assign to this business", exact: true }).click();
  await expect(page.getByText("Assigned to this business · You can open it", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await main.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Subscription/ })).toHaveAttribute("href", "/preview/strelva/website/dashboard/settings#plan");
  await page.screenshot({ path: info.outputPath("mobile-settings.png"), fullPage: true });
});
