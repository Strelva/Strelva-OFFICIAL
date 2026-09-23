"use client";

import { useEffect, type ReactNode } from "react";
import { initLenis, ScrollTrigger } from "@/lib/lenis";

export default function SmoothScrollProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      ScrollTrigger.refresh();
      return;
    }

    const { lenis, dispose } = initLenis();
    const handleResize = () => {
      lenis.resize();
      ScrollTrigger.refresh();
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      dispose();
    };
  }, []);

  return <>{children}</>;
}
