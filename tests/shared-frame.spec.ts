import { expect, test, type Page } from "@playwright/test";

test.skip(
  process.env.REB_DEV_UNGATED_ACCESS !== "1" && process.env.STRELVA_UI_PREVIEW !== "1",
  "Shared-frame browser checks require an explicitly enabled local fixture.",
);

const managedBase = process.env.STRELVA_UI_PREVIEW === "1" ? "/preview/strelva/website" : "";
const managedPath = (path: string) => `${managedBase}${path}`;

/**
 * The frame checks use the local dev tenant fixture and intercept the only
 * browser-side data request made by the navigation (thread history). They do
 * not use a real user session, tenant backend, provider, or AI operation.
 */
async function mockBrowserFixtures(page: Page) {
  await page.route("**/api/threads**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
}

test("preserves managed navigation and keeps chat as the single conversation route", async ({ page }) => {
  await mockBrowserFixtures(page);
  await page.goto(managedPath("/dashboard/chat"), { waitUntil: "domcontentloaded" });

  // The global shell and tenant-specific controls remain separate landmarks.
  const dashboardNav = page.getByLabel("Strelva navigation");
  await expect(dashboardNav).toBeVisible();
  await expect(dashboardNav.getByRole("navigation", { name: / website$/ })).toBeVisible();
  await expect(dashboardNav.getByRole("link", { name: "Today", exact: true })).toHaveAttribute("href", managedPath("/dashboard"));
  await expect(dashboardNav.getByRole("link", { name: "Ask Strelva", exact: true })).toHaveAttribute("href", managedPath("/dashboard/chat"));
  await expect(dashboardNav.getByRole("link", { name: "Website", exact: true })).toHaveAttribute("href", managedPath("/dashboard/site"));
  await expect(dashboardNav.getByRole("link", { name: "Analytics", exact: true })).toHaveAttribute("href", managedPath("/dashboard/analytics"));
  await expect(dashboardNav.getByRole("link", { name: "Reports", exact: true })).toHaveAttribute("href", managedPath("/dashboard/reports"));
  await expect(page.getByRole("banner")).toContainText("Managed Websites");

  // /dashboard/chat owns the full conversation. The shared frame must not add
  // a second contextual discussion trigger or mount a duplicate right rail.
  await expect(page.getByRole("banner").getByRole("button", { name: "Ask Strelva", exact: true })).toHaveCount(0);
  await expect(page.locator("#managed-discussion")).toHaveCount(0);
  await page.screenshot({ path: "test-results/shared-frame-chat-desktop.png", fullPage: true });
});

test("opens a contextual managed discussion beside non-chat work and returns focus", async ({ page }) => {
  await mockBrowserFixtures(page);
  await page.goto(managedPath("/dashboard/site"), { waitUntil: "domcontentloaded" });

  const trigger = page.getByRole("banner").getByRole("button", { name: "Ask Strelva", exact: true });
  const rail = page.locator("#managed-discussion");
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(rail).toBeHidden();

  await trigger.click();
  await expect(rail).toBeVisible();
  await expect(rail).toHaveAttribute("aria-label", "Ask Strelva");
  await expect(rail.getByRole("button", { name: "Close Ask Strelva" })).toBeFocused();
  await page.screenshot({ path: "test-results/shared-frame-discussion-desktop.png", fullPage: true });

  await page.keyboard.press("Escape");
  await expect(rail).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("makes the contextual rail a focused mobile replacement without horizontal overflow", async ({ page }) => {
  await mockBrowserFixtures(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(managedPath("/dashboard/site"), { waitUntil: "domcontentloaded" });

  const trigger = page.getByRole("banner").getByRole("button", { name: "Ask Strelva", exact: true });
  const rail = page.locator("#managed-discussion");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  await expect(rail).toBeVisible();
  await expect(rail).toHaveAttribute("role", "dialog");
  await expect(rail.getByRole("button", { name: "Close Ask Strelva" })).toBeFocused();
  await expect(page.locator("[data-right-rail='open'] [data-frame-main]")).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/shared-frame-discussion-mobile.png", fullPage: true });

  await page.keyboard.press("Escape");
  await expect(rail).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("keeps the existing navigation reachable when the shared frame collapses it", async ({ page }) => {
  await mockBrowserFixtures(page);
  await page.goto(managedPath("/dashboard/site"), { waitUntil: "domcontentloaded" });

  const frame = page.locator("[data-navigation-collapsed]").first();
  const collapse = page.getByRole("button", { name: "Collapse navigation" });
  await expect(collapse).toBeVisible();
  await expect(collapse).toHaveAttribute("aria-expanded", "true");
  await collapse.click();
  await expect(frame).toHaveAttribute("data-navigation-collapsed", "true");
  await expect(page.getByRole("navigation", { name: "Main", exact: true })).toBeHidden();
  const expand = page.getByRole("button", { name: "Expand navigation" });
  await expect(expand).toBeVisible();
  await expand.click();
  await expect(page.getByRole("navigation", { name: "Main", exact: true }).getByRole("link", { name: "Home", exact: true })).toHaveAttribute("href", managedBase ? "/preview/strelva/workspace" : "/workspace");
  await expect(page.getByRole("link", { name: "Today", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/shared-frame-collapsed-desktop.png", fullPage: true });
});


test("keeps global and website navigation together on mobile", async ({ page }) => {
  await mockBrowserFixtures(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(managedPath("/dashboard/site"), { waitUntil: "domcontentloaded" });
  const trigger = page.getByRole("button", { name: "Open navigation", exact: true });
  await trigger.click();
  const navigation = page.getByRole("dialog", { name: "Strelva navigation", exact: true });
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Home", exact: true })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Website", exact: true })).toBeVisible();
  await navigation.getByRole("link", { name: "Analytics", exact: true }).click();
  await expect(navigation).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`${managedBase}/dashboard/analytics$`));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("switches websites through an accessible control and the authorized destination", async ({ page }) => {
  await mockBrowserFixtures(page);
  const secondHref = `${managedPath("/dashboard/analytics")}?fixture=second-site`;
  await page.route("**/api/my-properties", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ properties: [
      { id: "preview-business", name: "Elmwood Studio", href: managedPath("/dashboard/site") },
      { id: "second-site", name: "Another fictional website with a long business name", href: secondHref },
    ] }),
  }));
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(managedPath("/dashboard/site"), { waitUntil: "domcontentloaded" });
  const switcher = page.getByRole("combobox", { name: "Website", exact: true });
  await expect(switcher).toBeVisible();
  const contextBox = await switcher.boundingBox();
  const askBox = await page.getByRole("banner").getByRole("button", { name: "Ask Strelva", exact: true }).boundingBox();
  expect(contextBox).not.toBeNull();
  expect(askBox).not.toBeNull();
  expect(contextBox!.x + contextBox!.width).toBeLessThanOrEqual(askBox!.x);
  expect(askBox!.x + askBox!.width).toBeLessThanOrEqual(320);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/shared-frame-website-switcher-320.png", fullPage: true });
  await switcher.selectOption("second-site");
  await expect(page).toHaveURL(new RegExp(`${managedBase}/dashboard/analytics\\?fixture=second-site$`));
});


test("keeps Website selected while opening Brand Kit", async ({ page }) => {
  await mockBrowserFixtures(page);
  await page.goto(managedPath("/dashboard/brand-kit"), { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: "Website", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("navigation", { name: "Website sections" }).getByRole("link", { name: "Brand Kit", exact: true })).toHaveAttribute("aria-current", "page");
});
