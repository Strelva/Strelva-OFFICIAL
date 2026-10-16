"use client";
/**
 * XA motion primitives for the seven moments in design/motion/xa-motion
 * (board nodes oSFGc, Pwq5y, BA8js, sqD2T, sguEC, F4hFz, bjUNl):
 *
 * 1. The yes ............ XaYes (yes.tsx)
 * 2. Queue row out ...... XaCollapse + XaRollingCount (here)
 * 3. Sidebar glide ...... XaGlideList (here); pages swap with no animation
 * 4. ⌘K palette ......... the workspace search dialog (kf-xa-palette, Fast)
 * 5. Ask, streamed ...... XaWorking + XaStream (working.tsx)
 * 6. Pebble poses ....... XaPebbleScene (characters.tsx)
 * 7. Undo drain ......... XaUndo (yes.tsx)
 *
 * Only what someone caused moves. Every timing is a ladder step; reduced
 * motion keeps a 120 ms crossfade and drops travel (see playStep).
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { playStep } from "@/platform/infra/motion";
import styles from "./xa.module.css";

/**
 * A row that leaves: confirms, then collapses its height and fades on Base,
 * so everything below travels up. Children stay mounted until the exit ends.
 */
export function XaCollapse({ show, children, onGone }: { show: boolean; children: ReactNode; onGone?: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(show);
  if (show && !mounted) setMounted(true);
  const first = useRef(show);
  const gone = useRef(onGone);
  useEffect(() => { gone.current = onGone; }, [onGone]);
  useLayoutEffect(() => {
    const node = box.current;
    if (!node) return;
    const height = `${node.scrollHeight}px`;
    // Rows already on the page at load stay still; only a change someone caused moves.
    if (first.current) { first.current = false; return; }
    if (show) { void playStep(node, [{ height: "0px", opacity: 0 }, { height, opacity: 1 }], "base"); return; }
    let live = true;
    void playStep(node, [{ height, opacity: 1 }, { height: "0px", opacity: 0 }], "base", { fill: "forwards" }).then(() => { if (live) { setMounted(false); gone.current?.(); } });
    return () => { live = false; };
  }, [show]);
  return mounted ? <div ref={box} className={styles.collapse} aria-hidden={!show || undefined}>{children}</div> : null;
}

/** A count that rolls: the old number lifts out, the new one rises in, on Fast. */
export function XaRollingCount({ value, label }: { value: number; label?: string }) {
  return <span className={styles.roll} aria-label={label ? `${value} ${label}` : undefined}>
    <span key={value} className={styles.rollIn} aria-hidden={label ? true : undefined}>{value}</span>
  </span>;
}

/**
 * A list whose selection glides. Put it around nav items; the item with
 * aria-current="page" gets a sliding highlight on Fast. The page itself swaps
 * instantly; only the selection travels.
 */
export function XaGlideList({ children, className, as: Tag = "div", label }: { children: ReactNode; className?: string; as?: "div" | "nav"; label?: string }) {
  const list = useRef<HTMLElement>(null);
  const [mark, setMark] = useState<{ y: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const node = list.current;
    if (!node) return;
    const measure = () => {
      const current = node.querySelector<HTMLElement>('[aria-current="page"]');
      setMark(current ? { y: current.offsetTop, height: current.offsetHeight } : null);
    };
    measure();
    const mutations = new MutationObserver(measure);
    mutations.observe(node, { subtree: true, attributes: true, attributeFilter: ["aria-current"], childList: true });
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    resize?.observe(node);
    return () => { mutations.disconnect(); resize?.disconnect(); };
  }, []);
  return <Tag ref={list as never} className={`${styles.glideList}${className ? ` ${className}` : ""}`} aria-label={label}>
    {mark ? <span className={styles.glide} style={{ translate: `0 ${mark.y}px`, height: mark.height }} aria-hidden="true" /> : null}
    {children}
  </Tag>;
}
