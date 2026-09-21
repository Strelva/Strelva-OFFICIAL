import { expect, test } from "@playwright/test";

test.skip(process.env.STRELVA_UI_PREVIEW !== "1", "Requires local component fixtures.");

test("material renders, pauses, suspends and restores after context loss", async ({ page }) => {
  await page.goto("/preview/strelva/components");
  const card = page.locator("[data-atmospheric-card]").first();
  const canvas = card.locator("canvas");
  await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute("data-motion", "running");
  await expect(card).toHaveAttribute("data-renderer", "webgl");
  const frames = () => canvas.evaluate(el => Number(el.dataset.frames));
  const initial = await frames();
  await expect.poll(frames).toBeGreaterThan(initial);
  await card.getByRole("button", { name: "Pause motion", exact: true }).click();
  await expect(card).toHaveAttribute("data-motion", "paused");
  const paused = await frames();
  await page.waitForTimeout(180);
  expect(await frames()).toBe(paused);
  await card.getByRole("button", { name: "Resume motion", exact: true }).click();
  await expect.poll(frames).toBeGreaterThan(paused);
  await page.getByRole("heading", { name: "Shared controls" }).scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute("data-motion", "offscreen");
  const offscreen = await frames();
  await page.waitForTimeout(180);
  expect(await frames()).toBe(offscreen);
  await card.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
  await expect(card).toHaveAttribute("data-motion", "hidden");
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  await expect(card).toHaveAttribute("data-motion", "running");
  await canvas.evaluate(el => {
    const extension = (el as HTMLCanvasElement).getContext("webgl")!.getExtension("WEBGL_lose_context")!;
    (window as Window & { restoreMaterial?: () => void }).restoreMaterial = () => extension.restoreContext();
    extension.loseContext();
  });
  await expect(card).toHaveAttribute("data-renderer", "fallback");
  await expect(card.getByRole("button", { name: "View example" })).toBeEnabled();
  await page.evaluate(() => (window as Window & { restoreMaterial?: () => void }).restoreMaterial?.());
  await expect(card).toHaveAttribute("data-renderer", "webgl");
  await expect(card).toHaveAttribute("data-motion", "running");
  expect(await canvas.evaluate(el => Math.max((el as HTMLCanvasElement).width, (el as HTMLCanvasElement).height))).toBeLessThanOrEqual(640);
});

test("responsive geometry, states, dialog keyboard recovery and theme", async ({ page }) => {
  await page.goto("/preview/strelva/components");
  for (const width of [320, 360, 768, 1280, 1600]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["dark", "light"]) {
      await page.getByLabel("Appearance", { exact: true }).selectOption(theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const geometry = await page.locator("[data-atmospheric-card]").first().evaluate(el => {
        const content = el.children[1]!;
        return [el, content].map(node => ({ padding: getComputedStyle(node).padding, radius: getComputedStyle(node).borderRadius, overflow: node.scrollWidth > node.clientWidth }));
      });
      expect(geometry).toEqual([{ padding: "24px", radius: "24px", overflow: false }, { padding: "0px", radius: "0px", overflow: false }]);
    }
  }
  await page.getByLabel("Example state", { exact: true }).selectOption("loading");
  await expect(page.getByRole("button", { name: "View example" }).first()).toBeDisabled();
  await page.getByLabel("Example state", { exact: true }).selectOption("unavailable");
  await expect(page.getByText("The example draft could not be loaded.", { exact: false }).first()).toBeVisible();
  const open = page.getByRole("button", { name: "Try again", exact: true }).first();
  await open.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(open).toBeFocused();
  await page.getByLabel("Example state", { exact: true }).selectOption("read-only");
  await expect(page.getByText("Shared for viewing", { exact: false }).first()).toBeVisible();
  await page.getByLabel("Example state", { exact: true }).selectOption("empty");
  await expect(page.getByRole("button", { name: "Start an example" }).first()).toBeEnabled();
});

test("reduced motion and unsupported WebGL retain readable controls", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/preview/strelva/components");
  const card = page.locator("[data-atmospheric-card]").first();
  await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute("data-motion", "static");
  const frames = await card.locator("canvas").getAttribute("data-frames");
  await page.waitForTimeout(150);
  await expect(card.locator("canvas")).toHaveAttribute("data-frames", frames!);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof original>) {
      if (String(args[0]).startsWith("webgl")) return null;
      return original.apply(this, args);
    } as typeof original;
  });
  await page.reload();
  await expect(card).toHaveAttribute("data-renderer", "fallback");
  await expect(card.getByRole("button", { name: "View example" })).toBeEnabled();
  expect(await card.locator("div").nth(1).evaluate(el => getComputedStyle(el).backdropFilter)).toBe("none");
});

test("shared controls have consistent geometry and keyboard focus", async ({ page }) => {
  await page.goto("/preview/strelva/colors");
  const scope = page.getByTestId("colors-dark");
  const primary = scope.getByRole("button", { name: "Primary action" });
  await primary.focus();
  expect(await primary.evaluate(el => ({ height: getComputedStyle(el).minHeight, radius: getComputedStyle(el).borderRadius, outline: getComputedStyle(el).outlineWidth }))).toEqual({ height: "40px", radius: "12px", outline: "2px" });
  const toggle = scope.getByRole("switch");
  expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(toggle).toHaveAttribute("aria-checked", "false");
});


test("live transparency and forced-color preferences switch to opaque fallback", async ({ page }) => {
  await page.goto("/preview/strelva/components");
  const card = page.locator("[data-atmospheric-card]").first();
  await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute("data-motion", "running");
  const session = await page.context().newCDPSession(page);
  for (const feature of ["prefers-reduced-transparency", "forced-colors"]) {
    await session.send("Emulation.setEmulatedMedia", { features: [{ name: feature, value: feature === "forced-colors" ? "active" : "reduce" }] });
    await expect(card).toHaveAttribute("data-renderer", "fallback");
    expect(await card.evaluate(el => getComputedStyle(el, "::before").backdropFilter)).toBe("none");
    const frames = await card.locator("canvas").getAttribute("data-frames");
    await page.waitForTimeout(150);
    await expect(card.locator("canvas")).toHaveAttribute("data-frames", frames!);
    await session.send("Emulation.setEmulatedMedia", { features: [{ name: feature, value: "no-preference" }] });
    await expect(card).toHaveAttribute("data-motion", "running");
  }
});

test("gooey disclosure reverses safely and removes collapsed controls from focus", async ({ page }) => {
  await page.goto("/preview/strelva/components");
  const toggle = page.getByRole("button", { name: "Collapse example", exact: true });
  const content = page.locator("#motion-example");
  await toggle.click();
  await expect(content).toHaveAttribute("inert", "");
  await expect(content).toHaveAttribute("aria-hidden", "true");
  await page.getByRole("button", { name: "Expand example", exact: true }).click();
  await expect(content).toHaveAttribute("aria-hidden", "false");
  await expect.poll(async () => (await content.boundingBox())!.height).toBeGreaterThan(80);
  await page.getByRole("button", { name: "Inspect motion example", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Inspect motion example", exact: true })).toBeFocused();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Collapse example", exact: true }).click();
  await expect.poll(async () => (await content.boundingBox())!.height).toBe(0);
  await page.keyboard.press("Tab");
  expect(await content.evaluate(el => el.contains(document.activeElement))).toBe(false);
});

test("foundation fields announce descriptions and tabs use a roving relationship", async ({ page }) => {
  await page.goto("/preview/strelva/components");
  await page.getByRole("heading", { name: "Foundation atoms", exact: true }).scrollIntoViewIfNeeded();

  const business = page.locator("#reference-business");
  const businessDescription = page.locator("#reference-business-description");
  const email = page.locator("#reference-email");
  const emailError = page.locator("#reference-email-error");
  for (const theme of ["dark", "light"]) {
    await page.getByLabel("Appearance", { exact: true }).selectOption(theme);
    await expect.poll(() => business.evaluate((element) => getComputedStyle(element).fontFamily)).toContain("Geist");
    await expect.poll(() => page.locator(".font-display").first().evaluate((element) => getComputedStyle(element).fontFamily)).toContain("Geist");
    await expect(business).toHaveAttribute("aria-describedby", "reference-business-description");
    await expect(businessDescription).toHaveText("Shown to customers in shared work.");
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await expect(email).toHaveAttribute("aria-describedby", "reference-email-error");
    await expect(emailError).toHaveAttribute("role", "alert");
  }

  const tabs = page.getByRole("tablist", { name: "Foundation examples" });
  const fieldsTab = page.getByRole("tab", { name: "Fields", exact: true });
  const keyboardTab = page.getByRole("tab", { name: "Keyboard", exact: true });
  await expect(fieldsTab).toHaveAttribute("aria-controls", "foundation-panel-fields");
  await expect(page.locator("#foundation-panel-fields")).toHaveAttribute("aria-labelledby", "foundation-tab-fields");
  await expect(fieldsTab).toHaveAttribute("tabindex", "0");
  await expect(keyboardTab).toHaveAttribute("tabindex", "-1");

  await fieldsTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(keyboardTab).toBeFocused();
  await expect(keyboardTab).toHaveAttribute("tabindex", "0");
  await expect(keyboardTab).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#foundation-panel-keyboard")).toBeVisible();
  await expect(page.locator("#foundation-panel-fields")).toBeHidden();
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: "States", exact: true })).toBeFocused();
  await expect(tabs).toHaveAttribute("aria-orientation", "horizontal");
});
