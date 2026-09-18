import glyphs from "./lettering-morph.json";

/** Matched closed contours: one opaque outline per letter, including counters. */
export function letteringPath(index: number, progress: number) {
  return (glyphs[index] ?? []).map(contour => contour.from.map((point, i) => {
    const [x = 0, y = 0] = point;
    const [tx = x, ty = y] = contour.to[i] ?? point;
    return `${i ? "L" : "M"}${(x + (tx - x) * progress).toFixed(2)},${(y + (ty - y) * progress).toFixed(2)}`;
  }).join("") + "Z").join("");
}

export function createLetteringMorph(svg: SVGSVGElement) {
  const paths = Array.from(svg.querySelectorAll<SVGPathElement>("[data-morph-letter]"));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const positions = paths.map(() => 0);
  const velocities = paths.map(() => 0);
  let target = 0, frame = 0, last = 0, changedAt = 0;
  function draw() { paths.forEach((path, i) => path.setAttribute("d", letteringPath(i, positions[i] ?? 0))); }
  function finish() {
    cancelAnimationFrame(frame); frame = 0;
    positions.fill(target); velocities.fill(0); draw();
  }
  function tick(now: number) {
    const dt = Math.min((now - last) / 1000, 1 / 30); last = now;
    let moving = false;
    paths.forEach((_, i) => {
      const delay = (target ? i : 6 - i) * 24;
      if (now - changedAt < delay) { moving = true; return; }
      const velocity = (velocities[i] ?? 0) + (170 * (target - (positions[i] ?? 0)) - 22 * (velocities[i] ?? 0)) * dt;
      const position = (positions[i] ?? 0) + velocity * dt;
      velocities[i] = velocity; positions[i] = position;
      if (Math.abs(target - position) > .0003 || Math.abs(velocity) > .003) moving = true;
      else { positions[i] = target; velocities[i] = 0; }
    });
    draw(); frame = moving ? requestAnimationFrame(tick) : 0;
  }
  function set(next: boolean) {
    target = Number(next);
    if (reduced.matches || document.hidden) { finish(); return; }
    changedAt = performance.now(); last = changedAt;
    if (!frame) frame = requestAnimationFrame(tick);
  }
  function onReduction() { if (reduced.matches) finish(); }
  function onVisibility() { if (document.hidden) finish(); }
  reduced.addEventListener("change", onReduction);
  document.addEventListener("visibilitychange", onVisibility);
  draw();
  return { set, destroy() {
    cancelAnimationFrame(frame);
    reduced.removeEventListener("change", onReduction);
    document.removeEventListener("visibilitychange", onVisibility);
  } };
}
