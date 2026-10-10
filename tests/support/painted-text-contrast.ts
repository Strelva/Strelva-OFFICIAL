/** Bounded solid-paint measurement; not a screenshot or general CSS contrast engine. */
export type Rgba = [number, number, number, number];
export type PaintLayer = { tag: string; color: Rgba; image: string };
export type TextPaint = { foreground: Rgba; layers: PaintLayer[]; unsupported: string[] };

/** Runs in the browser against the actual text/control and its painted ancestors. */
export function captureTextPaint(element: Element): TextPaint {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("A browser sRGB canvas is required for paint measurement.");
  const rgba = (value: string): Rgba => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const data = context.getImageData(0, 0, 1, 1).data;
    return [data[0]!, data[1]!, data[2]!, data[3]! / 255];
  };
  const layers: PaintLayer[] = [], unsupported: string[] = [];
  let opaque = false;
  for (let current: Element | null = element; current; current = current.parentElement) {
    const style = getComputedStyle(current);
    // Ancestor group opacity/filter/blending can affect text even beyond an opaque card.
    if (Number(style.opacity) !== 1) unsupported.push(`${current.tagName}: group opacity ${style.opacity}`);
    if (style.filter !== "none" || style.backdropFilter !== "none" || style.mixBlendMode !== "normal") unsupported.push(`${current.tagName}: filter or blending`);
    if (!opaque) {
      for (const pseudo of ["::before", "::after"]) {
        const paint = getComputedStyle(current, pseudo);
        if (paint.content !== "none" && paint.content !== "normal" && (rgba(paint.backgroundColor)[3] > 0 || paint.backgroundImage !== "none")) unsupported.push(`${current.tagName}${pseudo}: painted overlay`);
      }
      const color = rgba(style.backgroundColor);
      // Presence is sufficient for refusal; never attach CSS image URLs.
      layers.push({ tag: current.tagName, color, image: style.backgroundImage === "none" ? "none" : "present" });
      opaque = color[3] === 1;
    }
  }
  return { foreground: rgba(getComputedStyle(element).color), layers, unsupported };
}

export function textPaintContrast(paint: TextPaint) {
  if (paint.unsupported.length) throw new Error(`Cannot qualify this paint: ${paint.unsupported.join(", ")}`);
  const opaque = paint.layers.findIndex(layer => layer.color[3] === 1);
  if (opaque < 0) throw new Error("No opaque painted ancestor; canvas background is unknown.");
  const layers = paint.layers.slice(0, opaque + 1);
  if (layers.some(layer => layer.image !== "none")) throw new Error("Background image/gradient cannot be qualified by a solid-paint sample.");
  const over = (top: Rgba, bottom: Rgba): Rgba => {
    const alpha = top[3] + bottom[3] * (1 - top[3]);
    return [0, 1, 2].map(index => (top[index]! * top[3] + bottom[index]! * bottom[3] * (1 - top[3])) / alpha).concat(alpha) as Rgba;
  };
  let background = layers[opaque]!.color;
  for (let index = opaque - 1; index >= 0; index--) background = over(layers[index]!.color, background);
  const foreground = over(paint.foreground, background);
  const luminance = (color: Rgba) => color.slice(0, 3).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index]!, 0);
  const a = luminance(foreground), b = luminance(background);
  return { foreground, background, surface: layers[opaque]!.tag, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
}
