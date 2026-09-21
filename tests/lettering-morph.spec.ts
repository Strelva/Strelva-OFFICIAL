import { expect, test } from "@playwright/test";

test.skip(process.env.STRELVA_UI_PREVIEW !== "1", "Requires the local component preview.");

test("lettering reshapes opaque outlines and reverses without losing its endpoint", async ({ page }) => {
  await page.goto("/preview/strelva/components");
  const logo = page.getByRole("button", { name: "Use new Strelva lettering" });
  const paths = logo.locator("[data-morph-letter]");
  await expect(paths).toHaveCount(7);
  const original = await paths.first().getAttribute("d");
  await logo.hover();
  await expect.poll(() => paths.first().getAttribute("d")).not.toBe(original);
  expect(await paths.evaluateAll(nodes => nodes.every(node => getComputedStyle(node).opacity === "1"))).toBe(true);
  await page.mouse.move(0, 0);
  await expect.poll(() => paths.first().getAttribute("d")).toBe(original);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await logo.hover();
  await expect.poll(() => paths.first().getAttribute("d")).not.toBe(original);
  const final = await paths.first().getAttribute("d");
  await page.waitForTimeout(100);
  expect(await paths.first().getAttribute("d")).toBe(final);
  await page.mouse.move(0, 0);
  await expect.poll(() => paths.first().getAttribute("d")).toBe(original);
});
