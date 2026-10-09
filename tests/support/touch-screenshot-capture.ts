import { expect, type Page } from "@playwright/test";
import { captureTextPaint } from "./painted-text-contrast";

function captureInput() {
  return {
    coarse: matchMedia("(pointer: coarse)").matches,
    fine: matchMedia("(pointer: fine)").matches,
    hover: matchMedia("(hover: hover)").matches,
    touchPoints: navigator.maxTouchPoints,
    rootText: getComputedStyle(document.documentElement).fontSize,
  };
}
function captureLayout() {
  return [...document.querySelectorAll("button, h1, h2, h3, [role=status]")].map(node => {
    const box = node.getBoundingClientRect();
    return { x: box.x + scrollX, y: box.y + scrollY, width: box.width, height: box.height };
  });
}

/** Chromium captureBeyondViewport clears touch emulation and paints fine-pointer
 * CSS. Fit this closed fixture's full document at the same width for capture,
 * refuse changed review geometry, then restore the exact customer viewport. */
export async function touchScreenshotCapture(page: Page) {
  const configured = await page.evaluate(captureInput);
  expect(configured.coarse).toBe(true);
  expect(configured.fine).toBe(false);
  expect(configured.touchPoints).toBeGreaterThan(0);
  return {
    async capture(path: string) {
      const viewport = page.viewportSize();
      if (!viewport) throw new Error("A fixed customer viewport is required for touch evidence.");
      expect(await page.evaluate(captureInput)).toEqual(configured);
      const targets = page.locator("button:visible, h1:visible, h2:visible, h3:visible, [role=status]:visible");
      const paints = await Promise.all(Array.from({ length: await targets.count() }, (_, index) => targets.nth(index).evaluate(captureTextPaint)));
      const scroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
      const layout = await page.evaluate(captureLayout);
      const fullHeight = await page.evaluate(() => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight,
        document.body.offsetHeight, document.documentElement.offsetHeight, document.body.clientHeight, document.documentElement.clientHeight));
      const focus = await page.evaluateHandle(() => document.activeElement);
      try {
        try {
          if (fullHeight > viewport.height) {
            await page.setViewportSize({ width: viewport.width, height: fullHeight });
            await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
          }
          expect(await page.evaluate(captureInput)).toEqual(configured);
          expect(await page.evaluate(captureLayout)).toEqual(layout);
          expect(await targets.count()).toBe(paints.length);
          expect(await Promise.all(paints.map((_, index) => targets.nth(index).evaluate(captureTextPaint)))).toEqual(paints);
          expect(await focus.evaluate(node => node === document.activeElement)).toBe(true);
          expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
          await page.screenshot({ path, fullPage: true });
          expect(await page.evaluate(captureInput)).toEqual(configured);
          expect(await page.evaluate(captureLayout)).toEqual(layout);
          expect(await Promise.all(paints.map((_, index) => targets.nth(index).evaluate(captureTextPaint)))).toEqual(paints);
          expect(await focus.evaluate(node => node === document.activeElement)).toBe(true);
          expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
        } finally {
          if (fullHeight > viewport.height) {
            await page.setViewportSize(viewport);
            await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
          }
          await focus.evaluate(node => { if (node instanceof HTMLElement && node !== document.activeElement) node.focus({ preventScroll: true }); });
          await page.evaluate(point => window.scrollTo({ left: point.x, top: point.y, behavior: "instant" }), scroll);
          expect(await focus.evaluate(node => node === document.activeElement)).toBe(true);
          expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual(scroll);
        }
        expect(page.viewportSize()).toEqual(viewport);
        expect(await page.evaluate(captureInput)).toEqual(configured);
        expect(await page.evaluate(captureLayout)).toEqual(layout);
        expect(await targets.count()).toBe(paints.length);
        expect(await Promise.all(paints.map((_, index) => targets.nth(index).evaluate(captureTextPaint)))).toEqual(paints);
        expect(await focus.evaluate(node => node === document.activeElement)).toBe(true);
        expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual(scroll);
        return { captureMode: "full-page at original width, fitted document height; original customer viewport restored", customerViewport: viewport, captureViewport: { width: viewport.width, height: Math.max(viewport.height, fullHeight) }, configuredInput: configured };
      } finally { await focus.dispose(); }
    },
  };
}
