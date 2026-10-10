import { expect, test } from "@playwright/test";
const url = (state = "full", systems = "on") => `/preview/strelva?scenario=agency-systems&systems=${systems}&agency=${state}`;
for (const width of [1280, 390, 320]) {
  test(`provider queue delivery states at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(url());
    await page.getByRole("tab", { name: "Queue", exact: true }).click();
    const queue = page.getByRole("region", { name: "Delivery checks for your clients" });
    await expect(queue.getByText("Google listing change", { exact: true })).toBeVisible();
    await expect(queue.getByRole("heading", { name: "Owner not told", exact: true })).toBeVisible();
    await expect(queue.getByText("Read-back not confirmed", { exact: false })).toBeVisible();
    await queue.getByRole("button", { name: "Show more delivery checks" }).click();
    await expect(queue.getByText("Website change", { exact: true })).toBeVisible();
    await expect(queue.getByRole("button", { name: "Show more delivery checks" })).toHaveCount(0);
    await queue.getByRole("button", { name: "Refresh delivery checks" }).focus();
    await expect(queue.getByRole("button", { name: "Refresh delivery checks" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(queue.getByRole("button", { name: "Open client" }).first()).toBeFocused();
    await expect(queue).toHaveJSProperty("scrollWidth", await queue.evaluate(element => element.clientWidth));
    await queue.screenshot({ path: info.outputPath(`provider-queue-full-${width}.png`) });
    for (const [state, text] of [["empty", "No undelivered owner decisions"], ["error", "Delivery checks could not be loaded"], ["loading", "Checking read-backs and owner delivery"], ["queue-permission", "This client queue is unavailable to your account"]] as const) {
      await page.goto(url(state));
      await page.getByRole("tab", { name: "Queue", exact: true }).click();
      await expect(queue).toContainText(text);
      await queue.screenshot({ path: info.outputPath(`provider-queue-${state}-${width}.png`) });
    }
  });
}
test("provider queue also appears with the Systems release off and is absent for delegated agency readers", async ({ page }) => {
  await page.goto(url("full", "off"));
  await expect(page.getByRole("region", { name: "Delivery checks for your clients" })).toBeVisible();
  await page.goto(url("delegated"));
  await expect(page.getByRole("region", { name: "Delivery checks for your clients" })).toHaveCount(0);
});
