"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { initLenis, ScrollTrigger, type Lenis } from "@/lib/lenis";

interface LenisContextValue {
  lenis: Lenis | null;
  refresh: () => void;
}

const LenisContext = createContext<LenisContextValue>({
  lenis: null,
  refresh: () => {},
});

export function useLenis() {
  return useContext(LenisContext);
}

interface SmoothScrollProviderProps {
  children: ReactNode;
}

export default function SmoothScrollProvider({
  children,
}: SmoothScrollProviderProps) {
  const [lenis, setLenis] = useState<Lenis | null>(null);

  const refresh = useCallback(() => {
    if (lenis) {
      lenis.resize();
      ScrollTrigger.refresh();
    }
  }, [lenis]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (prefersReducedMotion) {
      ScrollTrigger.refresh();
      return;
    }

    const lenisInstance = initLenis();
    setLenis(lenisInstance);

    const handleResize = () => {
      lenisInstance.resize();
      ScrollTrigger.refresh();
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      lenisInstance.destroy();
      setLenis(null);
    };
  }, []);

  return (
    <LenisContext.Provider value={{ lenis, refresh }}>
      {children}
    </LenisContext.Provider>
  );
}
