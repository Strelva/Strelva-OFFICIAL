import type { CSSProperties } from "react";
import type { XaPose } from "@/components/ui/strelva/Xa";
import styles from "./xa-connections.module.css";

/**
 * Pebble standing free on the felt or the page at its natural size, with a
 * floor shadow under its feet (XA · C2). No disc, no tinted circle. Each use
 * names the job Pebble is doing in `label`; pass `decorative` only when the
 * sentence beside it already says it.
 */
export function Clay({ pose, width = 280, label, decorative = false }: { pose: XaPose; width?: number; label?: string; decorative?: boolean }) {
  return <span className={styles.clay} style={{ "--clay": `${width}px` } as CSSProperties} role={decorative ? undefined : "img"} aria-label={decorative ? undefined : label} aria-hidden={decorative || undefined}>
    <img src={`/xa/pose-${pose}.webp`} alt="" width={704} height={384} draggable={false} decoding="async" />
  </span>;
}
