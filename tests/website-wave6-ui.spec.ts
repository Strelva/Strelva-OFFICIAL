import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test.skip(process.env.STRELVA_UI_PREVIEW !== "1", "Requires development-only fictional fixtures.");
test.setTimeout(90_000);
test.use({ navigationTimeout: 60_000 });
expect.configure({ timeout: 15_000 });
test.beforeEach(async ({ page }) => {
  // Fixture journeys must never load a client or a provider, even when the
  // website System contains its actual public address in a frame.
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    return ["localhost", "127.0.0.1"].includes(url.hostname) ? route.continue() : route.abort();
  });
});
async function evidence(page: Page, name: string) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await mkdir("output/w6-website-proof/ui", { recursive: true });
  await page.screenshot({ path: `output/w6-website-proof/ui/${name}.png`, fullPage: true });
}
for (const width of [1280, 390, 320]) {
  test(`both website entry paths and retained failure at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/preview/strelva/website-entry", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-website-entry-ready="true"]')).toBeVisible();
    await page.getByRole("link", { name: "Connect your existing website" }).click();
    await expect(page.getByRole("button", { name: "Get my two lines" })).toBeVisible();
    await page.getByRole("link", { name: "Prepare a new website" }).click();
    await expect(page.locator('[data-website-entry-ready="true"]')).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Your current website" })).toBeVisible();
    await page.getByRole("button", { name: "No site yet? Describe your business" }).click();
    await expect(page.getByRole("textbox", { name: "Describe your business" })).toBeVisible();
    await page.getByRole("textbox", { name: "Business name" }).fill("Fictional bakery");
    await page.getByRole("textbox", { name: "Describe your business" }).fill("We bake bread and cakes. Customers can call our shop.");
    await page.getByRole("button", { name: "Build a private preview" }).click();
    await expect(page.getByRole("region", { name: "Private website preview" })).toBeVisible();
    await evidence(page, `entry-review-${width}`);
    await page.goto("/preview/strelva/website-entry?entry=rebuild&state=error", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-website-entry-ready="true"]')).toBeVisible();
    await page.getByRole("textbox", { name: "Your current website" }).fill("https://fictional.example.test");
    await page.getByRole("button", { name: "Build a private preview" }).click();
    await expect(page.getByRole("alert").first()).toContainText("Your address is kept");
    await expect(page.getByRole("textbox", { name: "Your current website" })).toHaveValue("https://fictional.example.test");
    await evidence(page, `entry-error-${width}`);
  });
  test(`saved crawl omissions and permission state at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/preview/strelva/rebuild?scenario=skipped-pages", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("The site's robots.txt blocks reading this page.")).toBeVisible();
    await expect(page.getByText("This page needs a browser to read.")).toBeVisible();
    await evidence(page, `crawl-omissions-${width}`);
    await page.goto("/preview/strelva/website-entry?entry=connect&state=permission", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("An owner or admin of this business connects its website.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Get my two lines" })).toHaveCount(0);
    await evidence(page, `entry-permission-${width}`);
  });
  test(`owner History prepares exact snapshot and document restores at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/preview/strelva?scenario=mooney&systems=on", { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: /^Open attymooney\.com/ }).click();
    await expect(page.getByRole("heading", { name: /^History \d+$/ })).toBeVisible();
    const history = page.getByRole("list", { name: "History", exact: true });
    await history.locator("li").filter({ hasText: "Daily copy" }).getByRole("button", { name: "Ask Strelva to restore", exact: true }).click();
    await expect(history.getByRole("status")).toContainText("exact saved copy");
    await page.getByRole("button", { name: "Show more history" }).click();
    const document = history.locator("li").filter({ hasText: "Published site revision 1" });
    await document.getByRole("button", { name: "Prepare restore" }).click();
    await expect(document.getByRole("status")).toContainText("prepared for review");
    await evidence(page, `history-restore-${width}`);
  });
}
test("empty, loading, unavailable and permission states stay honest", async ({ page }) => {
  for (const state of ["empty", "loading", "error", "permission"]) {
    await page.goto(`/preview/strelva?scenario=mooney&systems=on&websiteDetail=${state}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: /^Open attymooney\.com/ }).click();
    if (state === "empty") await expect(page.getByRole("heading", { name: "History", exact: true })).toHaveCount(0);
    else if (state === "loading") await expect(page.getByText(/Loading domains, requests and history/)).toBeVisible();
    else await expect(page.getByRole("alert").first()).toBeVisible();
    await evidence(page, `system-${state}`);
  }
});
