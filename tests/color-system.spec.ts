import { expect, test } from "@playwright/test";

test.skip(process.env.STRELVA_UI_PREVIEW !== "1", "Requires the local-only color reference.");

test("foundation foregrounds pass on their supported surfaces in both themes", async ({ page }) => {
  await page.goto("/preview/strelva/colors");
  const failures = await page.evaluate(() => {
    const result: string[] = [];
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const rgb = (css: string) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3); };
    const luminance = (c: number[]) => c.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i]!, 0);
    const ratio = (a: number[], b: number[]) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
    const pairs: [string, string][] = [
      ["on-accent", "accent"], ["on-warm-white", "warm-white"], ["on-action-danger", "action-danger"], ["on-positive", "positive"], ["text-popover", "surface-popover"], ["text-tooltip", "surface-tooltip"],
      ...["surface-base", "surface", "surface-raised", "surface-inset"].flatMap(bg => ["warm-black", "gray-muted", "gray-subtle", "gray-faint", "critical", "warning", "positive"].map(fg => [fg, bg] as [string, string])),
    ];
    for (const theme of ["light", "dark"]) {
      const parent = document.querySelector(`[data-testid="colors-${theme}"]`)!;
      const styles = getComputedStyle(parent);
      for (const [fg, bg] of pairs) {
        if (!styles.getPropertyValue(`--${fg}`).trim() || !styles.getPropertyValue(`--${bg}`).trim()) { result.push(`${theme}: missing ${fg}/${bg}`); continue; }
        const probe = document.createElement("span");
        probe.style.cssText = `color:var(--${fg});background:var(--${bg})`;
        parent.append(probe);
        const resolved = getComputedStyle(probe);
        const value = ratio(rgb(resolved.color), rgb(resolved.backgroundColor));
        if (value < 4.5) result.push(`${theme}: ${fg}/${bg} = ${value.toFixed(3)}`);
        probe.remove();
      }
    }
    return result;
  });
  expect(failures).toEqual([]);
});

function renderedContrast(el: Element) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const layers: Element[] = [];
  for (let current: Element | null = el; current; current = current.parentElement) layers.unshift(current);
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, 1, 1);
  for (const layer of layers) { ctx.fillStyle = getComputedStyle(layer).backgroundColor; ctx.fillRect(0, 0, 1, 1); }
  const background = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
  ctx.fillStyle = getComputedStyle(el).color;
  ctx.fillRect(0, 0, 1, 1);
  const foreground = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
  const luminance = (c: number[]) => c.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i]!, 0);
  return (Math.max(luminance(foreground), luminance(background)) + .05) / (Math.min(luminance(foreground), luminance(background)) + .05);
}

test("shared buttons retain readable rendered labels in resting and hover states", async ({ page }) => {
  await page.goto("/preview/strelva/colors");
  for (const theme of ["light", "dark"]) {
    const section = page.getByTestId(`colors-${theme}`);
    const contrast = section.getByRole("button", { name: "Contrast", exact: true });
    const danger = section.getByRole("button", { name: "Remove example", exact: true });
    for (const button of [contrast, danger, section.getByRole("button", { name: "Primary action", exact: true })]) {
      await page.mouse.move(0, 0);
      await expect.poll(() => button.evaluate(renderedContrast)).toBeGreaterThanOrEqual(4.5);
      await button.hover();
      await expect.poll(() => button.evaluate(renderedContrast)).toBeGreaterThanOrEqual(4.5);
    }
    for (const tone of ["good", "warn", "bad", "info", "neutral"]) {
      await expect.poll(() => section.getByText(tone, { exact: true }).evaluate(renderedContrast)).toBeGreaterThanOrEqual(4.5);
    }
    const toggle = section.getByRole("switch");
    const previous = await toggle.getAttribute("aria-checked");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", previous === "true" ? "false" : "true");
  }
});
