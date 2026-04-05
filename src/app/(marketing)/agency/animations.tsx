"use client";

import { useEffect } from "react";
import gsap from "gsap";

export function MarketingAnimations() {
  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Scroll reveals
    const sections = document.querySelectorAll(".reveal-section");
    if (prefersReduced) {
      sections.forEach((el) => gsap.set(el, { opacity: 1 }));
      return;
    }

    sections.forEach((el) => gsap.set(el, { opacity: 0, y: 24 }));

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            gsap.to(entry.target, {
              opacity: 1,
              y: 0,
              duration: 0.6,
              ease: "power2.out",
            });
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -60px 0px" }
    );

    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return null;
}
