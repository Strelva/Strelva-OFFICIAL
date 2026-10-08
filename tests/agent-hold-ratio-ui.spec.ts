import { expect, test } from "@playwright/test";

// Fictional local UI only; native SQL tests prove the aggregate and authority.
// No production service, notification or booking write is performed here.
test.skip(process.env.STRELVA_UI_PREVIEW !== "1", "Requires the local UI preview.");
for (const width of [1440, 390]) {
  test(`agent hold ratio observation and queue states at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    for (const scenario of ["agent-ratio", "agent-ratio-unavailable", "empty", "loading", "error", "denied"]) {
      await page.goto(`/preview/strelva/operator-queue?scenario=${scenario}`);
      if (scenario === "agent-ratio") {
        await expect(page.getByText("Agent holds: 3 of 20 mature requests customer-confirmed in the past 24 hours", { exact: true })).toBeVisible();
        await expect(page.getByText("Low customer confirmation share. Provisional threshold; review before taking action.", { exact: true })).toBeVisible();
        const take = page.getByRole("button", { name: "Take", exact: true }).first();
        await take.focus(); await expect(take).toBeFocused();
        // Fixture has no authenticated operator. A click must fail safely.
        await take.click();
        await expect(page.getByRole("status")).toContainText(/sign|operator|unavailable|permission|could not/i);
      } else if (scenario === "agent-ratio-unavailable") {
        await expect(page.getByText(/agent hold confirmations/i).first()).toBeVisible();
        await expect(page.getByText("Agent hold confirmation evidence unavailable", { exact: false }).first()).toBeVisible();
      } else if (scenario === "denied") {
        await expect(page.getByText("Operators only", { exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "Take", exact: true })).toHaveCount(0);
      } else if (scenario === "loading") {
        await expect(page.getByRole("status")).toHaveAttribute("aria-busy", "true");
        await expect(page.getByText("Reading the operator queue…", { exact: true })).toBeVisible();
      } else if (scenario === "error") {
        await expect(page.getByText("The queue could not be read", { exact: true })).toBeVisible();
      } else if (scenario === "empty") {
        await expect(page.getByText("Nothing is harming a site or waiting on Strelva.", { exact: true })).toBeVisible();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      await page.screenshot({ path: info.outputPath(`agent-ratio-${scenario}-${width}.png`), fullPage: true });
    }
  });
}
