import { expect, test } from "@playwright/test";

for (const product of ["visibility", "website"] as const) test(`${product} audit retains accessible pending, validation and recoverable errors across widths`, async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const website = product === "website";
  let release: () => void = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
  let requests = 0;
  await page.route(website ? "**/api/audit/scan" : "**/api/ai-visibility", async route => {
    requests += 1;
    await pending;
    await route.fulfill({ status: 503, json: { error: "Local fixture: assessment unavailable. Your input is retained." } });
  });
  await page.goto(website ? "/audit" : "/ai-visibility");
  const address = page.getByLabel(website ? "Website address" : "Website", { exact: true });
  await address.fill("http://[invalid");
  if (!website) await page.getByLabel("Business name", { exact: true }).fill("Fictional Bakery");
  const submit = page.getByRole("button", { name: website ? "Scan My Site" : "Run my AI audit", exact: true });
  await submit.click();
  await expect(address).toHaveAttribute("aria-invalid", "true");
  const error = page.getByRole("main").getByRole("alert");
  await expect(error).toContainText("valid");
  await expect(address).toHaveAttribute("aria-describedby", await error.getAttribute("id") as string);
  expect(requests).toBe(0);

  await address.fill("bakery.example");
  await submit.click();
  const status = page.getByRole("main").getByRole("status");
  await expect(status).toBeVisible();
  for (const width of [320, 360, 768, 1280, 1600]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `pending at ${width}`).toBe(true);
  }
  await page.setViewportSize({ width: 320, height: 900 });
  await page.screenshot({ path: info.outputPath(`${product}-pending-320.png`), fullPage: true });
  release();
  await expect(error).toContainText("Your input is retained");
  const recoveryField = website ? address : page.getByLabel("Business name", { exact: true });
  await expect(recoveryField).toBeFocused();
  await expect(recoveryField).toHaveAttribute("aria-describedby", await error.getAttribute("id") as string);
  await expect(recoveryField).not.toHaveAttribute("aria-invalid", "true");
  await expect(address).toHaveValue("bakery.example");
  await expect(address).not.toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("main").locator("form")).toHaveAttribute("aria-describedby", await error.getAttribute("id") as string);
  for (const width of [320, 360, 768, 1280, 1600]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `error at ${width}`).toBe(true);
  }
  await page.setViewportSize({ width: 360, height: 900 });
  // Enlarge text from its current computed values without compounding inherited
  // sizes. This checks text accommodation, not a claim about browser zoom UI.
  await page.evaluate(() => {
    const samples = Array.from(document.querySelectorAll<HTMLElement>("main *")).map(element => {
      const style = getComputedStyle(element);
      return { element, size: Number.parseFloat(style.fontSize), line: Number.parseFloat(style.lineHeight) };
    });
    for (const { element, size, line } of samples) {
      element.style.fontSize = `${size * 2}px`;
      if (Number.isFinite(line)) element.style.lineHeight = `${line * 2}px`;
    }
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "200% text enlargement").toBe(true);
  await expect(submit).toBeEnabled();
  await submit.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath(`${product}-error-text-200-percent-360.png`), fullPage: true });
});
