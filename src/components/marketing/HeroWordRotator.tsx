"use client";

import { useEffect, useState } from "react";

const outcomes = [
  "your hours",
  "your offers",
  "your classes",
  "your menu",
  "your booking link",
  "your photos",
  "your services",
  "your reviews",
];

export function HeroWordRotator() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setIndex((current) => (current + 1) % outcomes.length);
    }, 2000);

    return () => window.clearTimeout(timeout);
  }, [index]);

  return (
    <span
      aria-label={outcomes[index]}
      className="relative mt-1 flex min-h-[1.04em] w-full justify-center overflow-hidden text-[0.68em] text-[color:var(--m-accent)] sm:text-[0.76em] md:text-[0.84em]"
    >
      <span key={outcomes[index]} className="hero-word-single block whitespace-nowrap">
        {outcomes[index]}.
      </span>
    </span>
  );
}
