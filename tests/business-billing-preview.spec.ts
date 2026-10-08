import { expect, test } from "@playwright/test";

test.skip(process.env.STRELVA_UI_PREVIEW !== "1", "Requires the fictional local preview.");
for (const width of [1440, 390]) {
  test(`billing party, recovery and scoped navigation at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    for (const state of ["business", "agency", "unknown", "grandfathered", "empty", "error", "denied"]) {
      await page.goto(`/preview/strelva/business-billing?state=${state}`);
      await expect(page.getByRole("heading", { name: "Business billing", exact: true })).toBeVisible();
      const back = page.getByRole("link", { name: "Back to the business", exact: true });
      await expect(back).toHaveAttribute("href", "/workspace?workspaceId=11111111-1111-4111-8111-111111111111");
      await back.focus(); await expect(back).toBeFocused();
      await expect(page.locator('a[href="/dashboard/settings#plan"]')).toHaveCount(0);
      await expect(page.getByText("recipient@example.test", { exact: false })).toHaveCount(0);
      if (state === "agency") {
        await expect(page.getByText(/Agency: Fictional Neighborhood Agency/)).toBeVisible();
        await expect(page.getByRole("status")).toContainText("Sites and inquiry capture keep working");
      } else if (state === "business") await expect(page.getByText("Business: Maple Street Workshop", { exact: true })).toBeVisible();
      else if (state === "unknown") await expect(page.getByText(/The payer is not recorded/)).toBeVisible();
      else if (state === "grandfathered") await expect(page.getByText("Existing signed terms remain in force.", { exact: true })).toBeVisible();
      else if (state === "empty") await expect(page.getByText(/No billing record is attached/)).toBeVisible();
      else await expect(page.getByRole("main").getByRole("alert")).toContainText("Confirm your access and try again");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`billing-${state}-${width}.png`), fullPage: true });
    }
    await page.goto("/preview/strelva/business-billing?state=business");
    await page.getByRole("link", { name: "Back to the business", exact: true }).click();
    await page.waitForURL(url => url.pathname === "/workspace" || url.pathname === "/sign-in");
    const destination = new URL(page.url());
    expect(destination.pathname === "/sign-in" ? destination.searchParams.get("next") : destination.pathname + destination.search)
      .toBe("/workspace?workspaceId=11111111-1111-4111-8111-111111111111");
  });
}
