import { expect, test, type Page } from "@playwright/test";

test.skip(
  process.env.REB_DEV_UNGATED_ACCESS !== "1",
  "Shared-frame browser checks require the synthetic local dashboard access bypass.",
);

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
  await page.goto("/dashboard/chat", { waitUntil: "domcontentloaded" });

  // AppFrame labels the navigation slot; HistorySidebar owns the nested
  // Dashboard navigation landmark. Keep both semantics explicit instead of
  // coupling the check to the slot wrapper's implementation role.
  const dashboardNav = page.getByLabel("Managed Websites navigation");
  await expect(dashboardNav).toBeVisible();
  await expect(dashboardNav.getByRole("navigation", { name: "Dashboard" })).toBeVisible();
  await expect(dashboardNav.getByRole("link", { name: "Today", exact: true })).toHaveAttribute("href", "/dashboard");
  await expect(dashboardNav.getByRole("link", { name: "Ask Strelva", exact: true })).toHaveAttribute("href", "/dashboard/chat");
  await expect(dashboardNav.getByRole("link", { name: "Website", exact: true })).toHaveAttribute("href", "/dashboard/site");
  await expect(dashboardNav.getByRole("link", { name: "Analytics", exact: true })).toHaveAttribute("href", "/dashboard/analytics");
  await expect(dashboardNav.getByRole("link", { name: "Reports", exact: true })).toHaveAttribute("href", "/dashboard/reports");
  await expect(page.getByRole("banner")).toContainText("Managed Websites");

  // /dashboard/chat owns the full conversation. The shared frame must not add
  // a second contextual discussion trigger or mount a duplicate right rail.
  await expect(page.getByRole("banner").getByRole("button", { name: "Ask Strelva", exact: true })).toHaveCount(0);
  await expect(page.locator("#managed-discussion")).toHaveCount(0);
  await page.screenshot({ path: "test-results/shared-frame-chat-desktop.png", fullPage: true });
});

test("opens a contextual managed discussion beside non-chat work and returns focus", async ({ page }) => {
  await mockBrowserFixtures(page);
  await page.goto("/dashboard/site", { waitUntil: "domcontentloaded" });

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
  await page.goto("/dashboard/site", { waitUntil: "domcontentloaded" });

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
  await page.goto("/dashboard/site", { waitUntil: "domcontentloaded" });

  const frame = page.locator("[data-dashboard]").first();
  const collapse = page.getByRole("button", { name: "Collapse navigation" });
  await expect(collapse).toBeVisible();
  await expect(collapse).toHaveAttribute("aria-expanded", "true");
  await collapse.click();
  await expect(frame).toHaveAttribute("data-navigation-collapsed", "true");
  await expect(page.getByLabel("Managed Websites collapsed navigation")).toBeVisible();
  await expect(page.getByLabel("Managed Websites collapsed navigation").getByRole("link", { name: "Today" })).toHaveAttribute("href", "/dashboard");
  await page.screenshot({ path: "test-results/shared-frame-collapsed-desktop.png", fullPage: true });
});
