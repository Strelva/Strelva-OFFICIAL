import { expect, test } from "@playwright/test";
test.skip(process.env.STRELVA_UI_PREVIEW !== "1", "Requires local fictional interface preview.");
for (const width of [1280, 390]) {
  test(`Sibling context and real definition changes at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/preview/strelva?scenario=mooney&systems=on");
    await page.getByRole("link", { name: /^Open Mediation intake/ }).click();
    const versions = page.getByRole("region", { name: /^Versions/ });
    await expect(versions).toContainText("Arbitration");
    const disclosure = versions.getByText("What changed here · 3", { exact: true });
    await disclosure.focus(); expect(await disclosure.evaluate(node => node === document.activeElement)).toBe(true);
    await disclosure.press("Enter");
    await expect(versions).toContainText("Source baseline");
    await expect(versions).toContainText("We will call within one business day about your arbitration matter.");
    await expect(versions).toContainText("Removed");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await versions.screenshot({ path: `.scratch/w6-round5/version-siblings-${width}.png` });
  });
  for (const state of ["empty", "unavailable"]) {
    test(`Sibling comparison ${state} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`/preview/strelva?scenario=mooney&systems=on&sibling=${state}`);
      await page.getByRole("link", { name: /^Open Mediation intake/ }).click();
      const versions = page.getByRole("region", { name: /^Versions/ });
      await expect(versions).toContainText(state === "empty" ? "No local definition changes." : "Definition changes: Not verified.");
      await expect(versions.getByText(/What changed here/)).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      await versions.screenshot({ path: `.scratch/w6-round5/version-siblings-${state}-${width}.png` });
    });
  }
}
test("Read-only member can compare scoped sibling shapes without a write control", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/preview/strelva?scenario=mooney-member&systems=on");
  await page.getByRole("link", { name: /^Open Mediation intake/ }).click();
  const versions = page.getByRole("region", { name: /^Versions/ });
  await versions.getByText("What changed here · 3", { exact: true }).click();
  await expect(versions).toContainText("Arbitration intake");
  await expect(versions.getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Prepare this draft for release" })).toHaveCount(0);
  await versions.screenshot({ path: ".scratch/w6-round5/version-siblings-read-only-390.png" });
});
