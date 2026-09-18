"use client";

import { useEffect, useRef, useState } from "react";
import { StrelvaLockup } from "./StrelvaLockup";
import { createLetteringMorph } from "./lettering-morph";
import styles from "./StrelvaLockup.module.css";

/** Old Fraunces at rest; new vector lettering on hover/focus or a touch toggle. */
export function StrelvaLogoSwitch({ animated = false, paused = false, className = "" }: {
  animated?: boolean;
  paused?: boolean;
  className?: string;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const morph = useRef<ReturnType<typeof createLetteringMorph> | null>(null);
  useEffect(() => {
    const svg = button.current?.querySelector("svg");
    if (!svg) return;
    morph.current = createLetteringMorph(svg);
    return () => { morph.current?.destroy(); morph.current = null; };
  }, []);
  const [showNew, setShowNew] = useState(false);
  useEffect(() => { morph.current?.set(showNew); }, [showNew]);
  return <button
    ref={button}
    type="button"
    className={`${styles.switch} ${className}`}
    aria-label="Use new Strelva lettering"
    aria-pressed={showNew}
    data-new={showNew}
    onPointerEnter={event => { if (event.pointerType === "mouse") setShowNew(true); }}
    onPointerLeave={event => { if (event.pointerType === "mouse") setShowNew(false); }}
    onFocus={event => { if (event.currentTarget.matches(":focus-visible")) setShowNew(true); }}
    onBlur={() => setShowNew(false)}
    onClick={event => {
      if (event.detail === 0 || !window.matchMedia("(hover:hover)").matches) setShowNew(value => !value);
    }}
  ><StrelvaLockup animated={animated} paused={paused} compare /></button>;
}
