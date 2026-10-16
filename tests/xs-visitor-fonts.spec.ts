import { expect, test } from "@playwright/test";

test.skip(process.env.STRELVA_UI_PREVIEW !== "1", "Requires the explicit development-only interface preview.");

// The app binds Geist to --font-body. Pages a business's visitors see must
// compute to DM Sans (or the business's own --site-font), never Geist.
const ROUTES = ["manage?state=confirmed", "confirm?state=held", "offer?state=choose", "handoff?state=choose", "links", "blog", "post", "site-error", "site", "site?doc=mooney", "biz", "biz-missing"];

for (const route of ROUTES) {
  test(`visitor route ${route} renders in DM Sans`, async ({ page }) => {
    await page.goto(`/preview/strelva/xa/xs-visitor/${route}`);
    const family = await page.locator("h1").first().evaluate(el => getComputedStyle(el).fontFamily);
    expect(family).toMatch(/DM Sans/);
    expect(family).not.toMatch(/Geist/);
  });
}
