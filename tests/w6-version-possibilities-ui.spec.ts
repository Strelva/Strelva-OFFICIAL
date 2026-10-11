import { expect, test } from "@playwright/test";

test.skip(process.env.STRELVA_UI_PREVIEW !== "1", "Requires local fictional interface preview.");
for (const width of [1280, 390]) {
  test(`Version alternatives share Possibilities and one Make real decision at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/preview/strelva?scenario=mooney&systems=on&version=full");
    await page.getByRole("link", { name: /^Open Mediation intake/ }).click();
    const possibilities = page.getByRole("region", { name: /^Possibilities/ });
    await expect(possibilities.getByLabel("Version possibilities")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Shared improvements" })).toHaveCount(0);
    await possibilities.getByText("Compare with the current draft", { exact: true }).click();
    await expect(possibilities.getByLabel("Alternative definition")).toContainText("Mediation intake");
    await possibilities.getByRole("combobox", { name: "Choice for title" }).selectOption("take_upstream");
    await possibilities.getByRole("button", { name: "Prepare for review", exact: true }).click();
    await expect(possibilities.getByRole("status").filter({ hasText: "Ready for review" })).toBeVisible();
    await possibilities.getByText("Compare the release and alternative", { exact: true }).click();
    await expect(possibilities).toContainText("Mediation and arbitration intake");
    const alternative = possibilities.getByLabel("Prepared alternative preview");
    await alternative.getByRole("textbox", { name: "Your name", exact: true }).fill("Fictional test person");
    await alternative.getByRole("button", { name: "Submit record", exact: true }).click();
    await expect(alternative).toContainText("Test record added. Nothing was saved or shared.");
    const makeReal = possibilities.getByRole("button", { name: "Make real", exact: true });
    expect((await makeReal.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    await makeReal.focus();
    expect(await makeReal.evaluate(node => node === document.activeElement)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `.scratch/w6-round5/version-possibilities-${width}.png`, fullPage: true });
    await makeReal.click();
    await expect(possibilities.getByRole("status").filter({ hasText: "Version release went live" })).toBeVisible();
    await expect(possibilities.getByRole("button", { name: "Make real", exact: true })).toHaveCount(0);
  });
}
for (const state of ["loading", "error", "empty", "read-only", "missing-account"] as const) {
  test(`Version Possibilities ${state} is explicit on mobile`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/preview/strelva?scenario=mooney&systems=on&version=${state}`);
    await page.getByRole("link", { name: /^Open Mediation intake/ }).click();
    const possibilities = page.getByRole("region", { name: /^Possibilities/ });
    if (state === "loading") await expect(possibilities).toContainText("Reading Version possibilities");
    if (state === "error") await expect(possibilities.getByRole("alert")).toContainText("could not be read");
    if (state === "empty") await expect(possibilities).toContainText("no alternatives waiting");
    if (state === "read-only") await expect(possibilities.getByRole("button", { name: "Prepare for review" })).toHaveCount(0);
    if (state === "missing-account") {
      await expect(possibilities).toContainText("Connect booking_calendar");
      await expect(possibilities.getByRole("button", { name: "Prepare for review" })).toBeDisabled();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `.scratch/w6-round5/version-possibilities-${state}-390.png`, fullPage: true });
  });
}
