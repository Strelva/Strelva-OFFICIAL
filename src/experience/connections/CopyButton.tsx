"use client";

import { useEffect, useRef, useState } from "react";
import { XaButton } from "@/components/ui/strelva/Xa";
import styles from "./xa-connections.module.css";

/** Copies one exact value. Says so for two seconds; if the browser refuses, says how to copy by hand. */
export function CopyButton({ value, label, variant = "button" }: { value: string; label: string; variant?: "button" | "text" }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setState("idle"), 2000);
    } catch { setState("failed"); }
  }
  const text = state === "copied" ? "Copied" : "Copy";
  return <span className={styles.actions}>
    {variant === "text" ? <button type="button" className={styles.textButton} onClick={() => void copy()} aria-label={`Copy ${label}`}>{text}</button>
      : <XaButton size="sm" onClick={() => void copy()} aria-label={`Copy ${label}`}>{text}</XaButton>}
    <span role="status" className={state === "failed" ? styles.small : styles.srOnly}>{state === "failed" ? "Copy is unavailable here. Select it and copy it by hand." : state === "copied" ? `${label} copied` : ""}</span>
  </span>;
}
