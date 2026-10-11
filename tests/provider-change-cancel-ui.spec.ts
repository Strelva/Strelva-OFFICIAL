import { test, expect } from "@playwright/test";
for (const width of [1280, 390]) {
  test(`Owner can recover an unacknowledged request with keyboard, pending and retry at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    let release: (() => void) | undefined;
    let attempts = 0;
    await page.route("**/api/workspace/provider-change", async route => {
      expect(route.request().postDataJSON()).toEqual({ action: "cancel", requestId: "d2940000-0000-4000-8000-000000000040" });
      attempts++;
      if (attempts === 1) { await new Promise<void>(resolve => { release = resolve; }); await route.fulfill({ status: 503, json: { error: "Your access changed. Reload and try again." } }); }
      else await route.fulfill({ json: { id: "d2940000-0000-4000-8000-000000000040", status: "cancelled", cancellation: { cancelled_at: "2026-10-08T17:00:00Z" } } });
    });
    await page.goto("/preview/strelva/provider-change");
    const cancel = page.getByRole("button", { name: "Cancel provider change" });
    await cancel.focus(); await expect(cancel).toBeFocused(); await page.keyboard.press("Enter");
    await expect(cancel).toBeDisabled(); release?.();
    await expect(page.getByRole("status")).toHaveText("Your access changed. Reload and try again.");
    await expect(cancel).toBeEnabled(); await cancel.click();
    await expect(page.getByRole("status")).toHaveText("Provider change cancelled. Your current provider and billing stay as they are.");
    await expect(cancel).toHaveCount(0); await expect(page.getByText(/Your current provider and billing were kept/)).toBeVisible();
    expect(attempts).toBe(2); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`cancelled-${width}.png`), fullPage: true });
  });
  test(`Recovery controls exclude admin, agency and clocked/completed requests at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const query of ["role=admin", "role=agency", "state=awaiting_notice", "state=notified", "state=completed", "state=cancelled"]) {
      await page.goto(`/preview/strelva/provider-change?${query}`);
      await expect(page.getByRole("button", { name: "Cancel provider change" })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
}
