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
  return [...document.querySelectorAll("button, h1, h2, h3, [role=status], [data-dashboard], [data-frame-main]")].map(node => {
    const box = node.getBoundingClientRect();
    return { x: box.width || box.height ? box.x + scrollX : box.x, y: box.width || box.height ? box.y + scrollY : box.y, width: box.width, height: box.height };
  });
}

/** Chromium captureBeyondViewport clears touch emulation and paints fine-pointer
 * CSS. Pin the owned AppFrame to its observed customer height, then fit this closed
 * fixture's full document at the same width for capture,
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
      await page.evaluate(async () => {
        const animations = document.getAnimations().filter(animation => animation.playState === "running");
        if (animations.some(animation => !Number.isFinite(Number(animation.effect?.getComputedTiming().endTime)))) throw new Error("Touch evidence requires finite settled animations.");
        await Promise.all(animations.map(animation => animation.finished));
      });
      const targets = page.locator("button:visible, h1:visible, h2:visible, h3:visible, [role=status]:visible");
      const paints = await Promise.all(Array.from({ length: await targets.count() }, (_, index) => targets.nth(index).evaluate(captureTextPaint)));
      const scroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
      const layout = await page.evaluate(captureLayout);
      const fullHeight = await page.evaluate(() => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight,
        document.body.offsetHeight, document.documentElement.offsetHeight, document.body.clientHeight, document.documentElement.clientHeight));
      const frame = page.locator("[data-dashboard][data-navigation-collapsed]");
      expect(await frame.count()).toBe(1);
      const frameHeight = await frame.evaluate(node => node.getBoundingClientRect().height);
      expect(frameHeight).toBeGreaterThan(0);
      const frameProperty = await frame.evaluate(node => {
        const style = (node as HTMLElement).style;
        return { value: style.getPropertyValue("--app-frame-height"), priority: style.getPropertyPriority("--app-frame-height"),
          present: Array.from(style).includes("--app-frame-height"), styleAttributePresent: node.hasAttribute("style") };
      });
      const focus = await page.evaluateHandle(() => document.activeElement);
      const failures: unknown[] = [];
      const attempt = async (action: () => unknown | Promise<unknown>) => {
        try { await action(); } catch (error) { failures.push(error); }
      };
      try {
        if (fullHeight > viewport.height) {
          await frame.evaluate((node, height) => (node as HTMLElement).style.setProperty("--app-frame-height", `${height}px`, "important"), frameHeight);
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
      } catch (error) { failures.push(error); }
      finally {
        // Record each failure, but attempt every owned restoration before any
        // equality assertion. A rejected resize must not strand focus/scroll.
        if (fullHeight > viewport.height) {
          await attempt(() => page.setViewportSize(viewport));
          await attempt(() => frame.evaluate((node, property) => {
            const style = (node as HTMLElement).style;
            if (property.present) style.setProperty("--app-frame-height", property.value, property.priority);
            else style.removeProperty("--app-frame-height");
            if (!property.styleAttributePresent && style.length === 0) node.removeAttribute("style");
          }, frameProperty));
          await attempt(() => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))));
        }
        await attempt(() => focus.evaluate(node => { if (node instanceof HTMLElement && node !== document.activeElement) node.focus({ preventScroll: true }); }));
        await attempt(() => page.evaluate(point => window.scrollTo({ left: point.x, top: point.y, behavior: "instant" }), scroll));
        await attempt(async () => expect(await frame.evaluate(node => {
          const style = (node as HTMLElement).style;
          return { value: style.getPropertyValue("--app-frame-height"), priority: style.getPropertyPriority("--app-frame-height"),
            present: Array.from(style).includes("--app-frame-height"), styleAttributePresent: node.hasAttribute("style") };
        })).toEqual(frameProperty));
        await attempt(() => expect(page.viewportSize()).toEqual(viewport));
        await attempt(async () => expect(await page.evaluate(captureInput)).toEqual(configured));
        await attempt(async () => expect(await page.evaluate(captureLayout)).toEqual(layout));
        await attempt(async () => expect(await targets.count()).toBe(paints.length));
        await attempt(async () => expect(await Promise.all(paints.map((_, index) => targets.nth(index).evaluate(captureTextPaint)))).toEqual(paints));
        await attempt(async () => expect(await focus.evaluate(node => node === document.activeElement)).toBe(true));
        await attempt(async () => expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual(scroll));
        await attempt(() => focus.dispose());
      }
      if (failures.length === 1) throw failures[0];
      if (failures.length > 1) throw new AggregateError(failures, "Touch capture refused; capture and restoration failures retained.", { cause: failures[0] });
      return { captureMode: "full-page at original width with observed customer AppFrame height pinned; fitted capture viewport, original customer viewport and frame property restored", frameHeightPin: { property: "--app-frame-height", observedCustomerHeight: frameHeight, original: frameProperty, restored: true }, customerViewport: viewport, captureViewport: { width: viewport.width, height: Math.max(viewport.height, fullHeight) }, configuredInput: configured };
    },
  };
}
