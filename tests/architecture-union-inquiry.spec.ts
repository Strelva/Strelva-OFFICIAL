import { test, expect } from "@playwright/test";

for (const width of [1440, 390]) test(`${width}px installed inquiry withholds an unqualified Open destination`, async ({ page }, testInfo) => {
  const outside: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(testInfo.project.use.baseURL as string).origin || url.pathname.startsWith("/api/")) {
      outside.push(url.pathname); await route.abort(); return;
    }
    await route.continue();
  });
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/preview/strelva/architecture-union-inquiry-proof");
  await expect(page.getByRole("heading", { name: "Customer inquiry intake", exact: true })).toBeVisible();
  const surface = page.getByRole("region", { name: "Where people use it" });
  await expect(surface).toContainText("Inquiry workspace");
  await expect(surface).toContainText("Unavailable");
  await expect(surface.getByRole("link")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Open/ })).toHaveCount(0);
  const back = page.getByRole("button", { name: "Back to ready-made systems" });
  await back.focus(); await expect(back).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(outside).toEqual([]); expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("inquiry-unavailable.png") });
});
