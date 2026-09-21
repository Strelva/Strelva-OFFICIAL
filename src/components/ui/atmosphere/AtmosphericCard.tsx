"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type HTMLAttributes } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/cn";
import { createCloudRenderer, type AtmosphereTheme } from "./cloud-renderer";
import styles from "./atmospheric-card.module.css";

export interface AtmosphericCardProps extends HTMLAttributes<HTMLElement> {
  variant?: 0 | 1 | 2 | 3 | 4 | 5;
  theme?: AtmosphereTheme;
  contentClassName?: string;
  /** Controlled pause state. Without this prop, the card owns its pause button. */
  paused?: boolean;
  onPausedChange?: (paused: boolean) => void;
}

/** Keep links and controls inside the content; do not make the whole card a link. */
export const AtmosphericCard = forwardRef<HTMLElement, AtmosphericCardProps>(function AtmosphericCard(
  { variant = 0, theme, contentClassName, paused, onPausedChange, className, children, ...props },
  forwardedRef,
) {
  const cardRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ReturnType<typeof createCloudRenderer> | null>(null);
  const [localPaused, setLocalPaused] = useState(false);
  const isPaused = paused ?? localPaused;
  const initialPaused = useRef(isPaused);
  useImperativeHandle(forwardedRef, () => cardRef.current!, []);

  useEffect(() => {
    if (!cardRef.current || !canvasRef.current) return;
    const renderer = createCloudRenderer({ card: cardRef.current, canvas: canvasRef.current, variant, theme, paused: initialPaused.current });
    rendererRef.current = renderer;
    return () => { renderer.destroy(); rendererRef.current = null; };
  }, [variant, theme]);

  useEffect(() => {
    initialPaused.current = isPaused;
    rendererRef.current?.setPaused(isPaused);
  }, [isPaused, variant, theme]);

  return (
    <section
      {...props}
      ref={cardRef}
      className={cn(styles.card, className)}
      data-atmospheric-card=""
      data-material={variant}
      data-palette={theme}
    >
      <div className={styles.material} aria-hidden="true">
        <canvas ref={canvasRef} className={styles.canvas} />
      </div>
      <div className={cn(styles.content, contentClassName)}>{children}</div>
      <div className={styles.motionControls}>
        <button
          type="button"
          className={styles.motionButton}
          aria-pressed={isPaused}
          disabled={paused !== undefined && !onPausedChange}
          onClick={(event) => {
            event.stopPropagation();
            if (paused === undefined) setLocalPaused(!isPaused);
            onPausedChange?.(!isPaused);
          }}
        >
          {isPaused ? <Play aria-hidden="true" size={16} strokeWidth={1.5} /> : <Pause aria-hidden="true" size={16} strokeWidth={1.5} />}
          {isPaused ? "Resume motion" : "Pause motion"}
        </button>
      </div>
    </section>
  );
});
