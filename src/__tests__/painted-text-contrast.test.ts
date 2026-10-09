import { describe, expect, it } from "vitest";
import { textPaintContrast, type Rgba, type TextPaint } from "../../tests/support/painted-text-contrast";

const paint = (foreground: Rgba, background: Rgba): TextPaint => ({ foreground, layers: [{ tag: "SECTION", color: background, image: "none" }], unsupported: [] });

describe("bounded actual foreground contrast measurement", () => {
  it("fails the retained brown-on-dark card evidence independently of token names", () => {
    const measurement = textPaintContrast(paint([42, 37, 32, 1], [21, 21, 21, 1]));
    expect(measurement.ratio).toBeCloseTo(1.203, 3);
    expect(measurement.ratio).toBeLessThan(4.5);
  });
  it("fails the retained brown-on-dark fixture header evidence", () => {
    expect(textPaintContrast(paint([42, 37, 32, 1], [11, 11, 12, 1])).ratio).toBeCloseTo(1.297, 3);
  });
  it("qualifies a readable actual light foreground without accepting a token string", () => {
    expect(textPaintContrast(paint([244, 244, 245, 1], [21, 21, 21, 1])).ratio).toBeGreaterThan(16);
  });
  it("composites transparent text ancestors over the nearest opaque card instead of assuming white", () => {
    const input = paint([42, 37, 32, 1], [0, 0, 0, 0]);
    input.layers.push({ tag: "ARTICLE", color: [21, 21, 21, 1], image: "none" }, { tag: "MAIN", color: [255, 255, 255, 1], image: "none" });
    const result = textPaintContrast(input);
    expect(result.background).toEqual([21, 21, 21, 1]);
    expect(result.surface).toBe("ARTICLE");
    expect(result.ratio).toBeLessThan(4.5);
  });
  it("composites a translucent background layer over the actual opaque surface", () => {
    const input = paint([0, 0, 0, 1], [255, 255, 255, .5]);
    input.layers.push({ tag: "MAIN", color: [0, 0, 0, 1], image: "none" });
    expect(textPaintContrast(input).background).toEqual([127.5, 127.5, 127.5, 1]);
  });
  it("includes foreground alpha rather than qualifying invisible white text", () => {
    expect(textPaintContrast(paint([255, 255, 255, .1], [21, 21, 21, 1])).ratio).toBeLessThan(4.5);
  });
  it("refuses unknown canvas background", () => {
    expect(() => textPaintContrast(paint([0, 0, 0, 1], [0, 0, 0, 0]))).toThrow("No opaque");
  });
  it("refuses background images on the text paint path", () => {
    const input = paint([255, 255, 255, 1], [21, 21, 21, 1]); input.layers[0]!.image = "linear-gradient(black, white)";
    expect(() => textPaintContrast(input)).toThrow("image/gradient");
  });
  it("ignores a fully covered outer gradient beyond the opaque card", () => {
    const input = paint([244, 244, 245, 1], [21, 21, 21, 1]);
    input.layers.push({ tag: "MAIN", color: [0, 0, 0, 1], image: "linear-gradient(black, white)" });
    expect(textPaintContrast(input).ratio).toBeGreaterThan(16);
  });
  for (const effect of ["group opacity .5", "filter or blending", "painted overlay"]) it(`refuses ${effect} instead of silently claiming a pass`, () => {
    const input = paint([255, 255, 255, 1], [0, 0, 0, 1]); input.unsupported.push(effect);
    expect(() => textPaintContrast(input)).toThrow("Cannot qualify");
  });
});
