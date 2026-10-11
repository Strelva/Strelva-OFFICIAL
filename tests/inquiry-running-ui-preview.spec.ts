import { expect, test } from "@playwright/test";
test.skip(process.env.STRELVA_UI_PREVIEW !== "1", "Requires isolated interface fixtures.");
for (const width of [1280, 390]) {
  test(`Running keeps honest inquiry policy and other work through switch loading/error at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/operations?*", route => route.fulfill({ json: { responsibilities: [] } }));
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    await page.route("**/api/workspace/inquiries/system?*", async route => {
      if (route.request().url().includes("000000000010")) await route.fulfill({ json: { details: [{ running: [
        { id: "business:form:policy", title: "Handle inquiries from Juniper Bakery", status: "active", sentence: "Strelva reviews ordinary replies before sending; stricter approvals still apply. Policy hours: Mon, Wed, 09:00–17:00 America/New_York; up to 12 messages per day. Prices, dates and promises need your approval." },
        { id: "business:other:policy", title: "Handle catering inquiries from Juniper Bakery", status: "paused", sentence: "Replies and follow-ups are paused. Incoming inquiries stay kept." }] }] } });
      else { await pending; await route.fulfill({ status: 503, json: { error: "Storage unavailable" } }); }
    });
    await page.goto("/preview/strelva/inquiry-running");
    await expect(page.getByRole("heading", { name: "What Strelva keeps running" })).toBeVisible();
    await expect(page.getByText("Active policy", { exact: true })).toBeVisible();
    await expect(page.getByText("Paused", { exact: true })).toBeVisible();
    await expect(page.getByText("Policy hours:", { exact: false })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Saved checks that can run again" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `output/w6-inquiry-running-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Open Maple" }).focus(); await page.keyboard.press("Enter");
    await expect(page.getByText("Checking inquiry reply policies…", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Handle inquiries from Juniper Bakery" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Saved checks that can run again" })).toBeVisible();
    finish();
    await expect(page.getByRole("button", { name: "Retry inquiry policies" })).toBeVisible();
    await expect(page.getByText("Other running work is still available.", { exact: false })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `output/w6-inquiry-running-error-${width}.png`, fullPage: true });
  });
}
