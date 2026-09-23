import Lenis from "@studio-freight/lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export function initLenis(): { lenis: Lenis; dispose: () => void } {
  const lenis = new Lenis({
    duration: 1.2,
    easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    orientation: "vertical",
    gestureOrientation: "vertical",
    smoothWheel: true,
    wheelMultiplier: 1,
    touchMultiplier: 2,
  });

  lenis.on("scroll", ScrollTrigger.update);

  const tick = (time: number) => lenis.raf(time * 1000);
  gsap.ticker.add(tick);

  gsap.ticker.lagSmoothing(0);

  let disposed = false;
  let refreshFrame = requestAnimationFrame(() => {
    if (disposed) return;
    refreshFrame = requestAnimationFrame(() => {
      if (!disposed) ScrollTrigger.refresh(true);
    });
  });

  return {
    lenis,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(refreshFrame);
      gsap.ticker.remove(tick);
      lenis.destroy();
    },
  };
}

export { ScrollTrigger };
export type { Lenis };
