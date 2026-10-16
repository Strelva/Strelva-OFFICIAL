"use client";
/**
 * THE YES. One gesture, product-wide. Pen: LX · Button · Primary + Quiet in
 * the decision of XA · O3 (MdDX8), LX · Undo (N2cSZg); motion moments
 * "The yes" (oSFGc) and "Undo, with a visible window" (bjUNl).
 *
 * The ink pill says the consequence ("Make it live", GLOSSARY); "Not yet" sits beside it
 * as a quiet action. ⌘↵ (Ctrl+Enter) presses it from anywhere on the screen
 * while it waits. The state flips at once; the Working trail then shows each
 * real step the caller reports; Live settles and Undo rises with a draining
 * window. Undo is the caller's real reversal. A failure keeps Pebble in frame
 * with what happened and one way forward.
 *
 * Authority stays with the caller: XaYes never decides who may say yes and
 * never calls a server itself.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { XA_YES_LABELS } from "@/platform/presentation/place-labels";
import { XaButton } from "./actions";
import { XaPebbleAvatar } from "./characters";
import { XaWorking, type XaWorkingStep } from "./working";
import styles from "./xa.module.css";

/* ---------- Undo ---------- */

/**
 * The Undo pill. With `windowMs` a 2 px bar drains for that long, then
 * `onExpire` runs (the caller drops the pill or shows "Undo window ended").
 * ⌘Z presses Undo while the pill is up when `shortcut` is set.
 */
export function XaUndo({ children, onUndo, undoLabel = XA_YES_LABELS.undo, windowMs, onExpire, shortcut = false }: { children: ReactNode; onUndo?: () => void; undoLabel?: string; windowMs?: number; onExpire?: () => void; shortcut?: boolean }) {
  const expire = useRef(onExpire);
  const undo = useRef(onUndo);
  useEffect(() => { expire.current = onExpire; undo.current = onUndo; }, [onExpire, onUndo]);
  useEffect(() => {
    if (!shortcut || !onUndo) return;
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z" || event.shiftKey) return;
      const target = event.target;
      if (target instanceof Element && target.closest("input, textarea, [contenteditable='true']")) return;
      event.preventDefault(); undo.current?.();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [shortcut, onUndo]);
  return <div className={styles.undo} data-quiet={!onUndo || undefined} role="status" aria-live="polite">
    <Check size={16} strokeWidth={2.4} aria-hidden="true" />
    <span className={styles.undoLabel}>{children}</span>
    {onUndo ? <button type="button" className={styles.undoButton} onClick={onUndo} aria-keyshortcuts={shortcut ? "Meta+Z Control+Z" : undefined}>{undoLabel}</button> : null}
    {windowMs && onUndo ? <span className={styles.undoBar} style={{ animationDuration: `${windowMs}ms` }} onAnimationEnd={() => expire.current?.()} aria-hidden="true" /> : null}
  </div>;
}

/** Where an Undo pill floats: bottom center, above phone navigation. */
export function XaUndoDock({ children }: { children: ReactNode }) {
  return <div className={styles.undoDock}>{children}</div>;
}

/* ---------- The yes ---------- */

export type XaYesState = "waiting" | "going" | "live" | "failed" | "undone" | "expired";

// Only the newest waiting yes on a screen answers ⌘↵.
const shortcutOwners: string[] = [];

interface XaYesProps {
  state: XaYesState;
  onYes: () => void;
  onNotYet?: () => void;
  onUndo?: () => void;
  /** Undo window after Live. Defaults to strelvaUndoWindowMs. */
  undoWindowMs?: number;
  onUndoExpired?: () => void;
  yesLabel?: string;
  notYetLabel?: string;
  /** Working trail title and the caller's real progress steps. */
  working?: { title: ReactNode; steps: readonly XaWorkingStep[] };
  /** The Undo pill's sentence after Live, e.g. "Live on your booking page". */
  liveLabel?: ReactNode;
  /** What went wrong, in one plain sentence. Pebble says it. */
  failure?: ReactNode;
  /** Shown after Undo or after the window ends. */
  settled?: ReactNode;
  /**
   * Blocks the yes. There is then no gray pill: Pebble says why in one
   * sentence, and `unblock` (the caller's action that clears it) sits beside
   * "Not yet".
   */
  disabledReason?: ReactNode;
  /** What clears `disabledReason`: usually the screen's one primary ("Reconnect Google", "Check with the feed again"). */
  unblock?: ReactNode;
  /** The Undo pill's action word. Defaults to "Undo"; "Roll it back" when undoing is its own change. */
  undoLabel?: string;
  /** Holds the pill while something else on the screen is saving. Prefer disabledReason when the person can act on why. */
  disabled?: boolean;
  /**
   * The confirm step for an act with no server Undo (cancel a booking, leave a
   * business): one plain sentence said inside the yes, above the pill. Still one
   * gesture: the pill is the confirmation, "Not yet" backs out.
   */
  question?: ReactNode;
  /** Names the pill for assistive tech when several sit on one screen, e.g. "Make it live: Fees". */
  yesAriaLabel?: string;
  notYetAriaLabel?: string;
  block?: boolean;
  shortcut?: boolean;
}

export function XaYes({ state, onYes, onNotYet, onUndo, undoWindowMs = 5000, onUndoExpired, yesLabel = XA_YES_LABELS.yes, notYetLabel = XA_YES_LABELS.notYet, working, liveLabel, failure, settled, disabledReason, unblock, undoLabel, disabled = false, question, yesAriaLabel, notYetAriaLabel, block = true, shortcut = true }: XaYesProps) {
  const id = useId();
  const reasonId = `${id}-reason`;
  const yes = useRef(onYes);
  const [pressed, setPressed] = useState(false);
  useEffect(() => { yes.current = onYes; }, [onYes]);
  if (pressed && state !== "waiting") setPressed(false);
  const listening = shortcut && state === "waiting" && !disabledReason && !disabled;
  useEffect(() => {
    if (!listening) return;
    shortcutOwners.push(id);
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
      if (shortcutOwners[shortcutOwners.length - 1] !== id) return;
      event.preventDefault(); setPressed(true); yes.current();
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); const at = shortcutOwners.lastIndexOf(id); if (at >= 0) shortcutOwners.splice(at, 1); };
  }, [listening, id]);

  if (state === "going" || state === "live") return <div className={styles.yes}>
    {working ? <XaWorking title={working.title} steps={working.steps} state={state === "live" ? "done" : "working"} /> : null}
    {state === "live" && liveLabel ? <XaUndoDock><XaUndo onUndo={onUndo} undoLabel={undoLabel} windowMs={onUndo ? undoWindowMs : undefined} onExpire={onUndoExpired} shortcut>{liveLabel}</XaUndo></XaUndoDock> : null}
  </div>;
  if (state === "failed") return <div className={styles.yes}>
    {working ? <XaWorking title={working.title} steps={working.steps} state="failed" /> : null}
    <div className={styles.yesFailed} role="alert"><XaPebbleAvatar size={32} /><p>{failure ?? "It did not go live. Nothing changed on your page."}</p></div>
    <div className={styles.yesActions}><XaButton variant="primary" size="lg" block={block} onClick={onYes}>{XA_YES_LABELS.tryAgain}</XaButton>{onNotYet ? <XaButton variant="quiet" size="lg" onClick={onNotYet}>{notYetLabel}</XaButton> : null}</div>
  </div>;
  if (state === "undone" || state === "expired") return <div className={styles.yes}>{settled ? <p className={styles.yesSettled} role="status">{settled}</p> : null}</div>;
  const questionId = `${id}-question`;
  // Blocked: no disabled gray pill. Pebble says why, and what clears it sits beside Not yet.
  if (disabledReason) return <div className={styles.yes} data-blocked="true">
    {question ? <p className={styles.yesQuestion}>{question}</p> : null}
    <div className={styles.yesBlocked} role="status"><XaPebbleAvatar size={28} /><p id={reasonId}>{disabledReason}</p></div>
    {unblock || onNotYet ? <div className={styles.yesActions}>{unblock}{onNotYet ? <XaButton variant="quiet" size="lg" aria-label={notYetAriaLabel} onClick={onNotYet}>{notYetLabel}</XaButton> : null}</div> : null}
  </div>;
  return <div className={styles.yes} role={question ? "group" : undefined} aria-labelledby={question ? questionId : undefined}>
    {question ? <p id={questionId} className={styles.yesQuestion}>{question}</p> : null}
    <div className={styles.yesActions}>
      <XaButton variant="primary" size="lg" block={block} busy={pressed || disabled} aria-label={yesAriaLabel} aria-keyshortcuts={listening ? "Meta+Enter Control+Enter" : undefined} hint={listening ? "⌘↵" : undefined} onClick={() => { if (pressed) return; setPressed(true); onYes(); }}>{yesLabel}</XaButton>
      {onNotYet ? <XaButton variant="quiet" size="lg" disabled={pressed} aria-label={notYetAriaLabel} onClick={onNotYet}>{notYetLabel}</XaButton> : null}
    </div>
  </div>;
}

/**
 * The decision: one white panel with what waits, the real artifact (usually
 * an XaPage) and the yes. The page's one object; nothing else on the screen
 * gets this shadow.
 */
export function XaDecision({ status, meta, children, yes, label }: { status: ReactNode; meta?: ReactNode; children: ReactNode; yes: ReactNode; label: string }) {
  return <section className={styles.decision} aria-label={label}>
    <div className={styles.decisionHead}>{status}{meta ? <span className={styles.decisionMeta}>{meta}</span> : null}</div>
    {children}
    {yes}
  </section>;
}
