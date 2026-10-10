"use client";

/*
 * Strelva 1.0 kit (October 9, 2026). One owned set of pieces for every
 * workspace, agency, operator and public surface. Visual source and rules:
 * design/foundation/FOUNDATION.md sections 6 and 7 and the Pen canon.
 *
 * Composition rules this kit encodes:
 * - One calm column (StPage). Wide only for dense comparison.
 * - Lists are open rows with hairlines (StRows/StRow), never a bordered box.
 *   StSurface is for real objects only: a draft, a preview, a receipt.
 * - Labels are sentence case (StLabel). Mono (StMono) only for times,
 *   counts, paths, keys and record values.
 * - One solid primary action per view (StPill). Everything else is soft
 *   (StPill variant="soft") or a text action (StTextButton).
 */

import Link from "next/link";
import { Check, ChevronLeft, Circle, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type HTMLAttributeAnchorTarget, type ReactNode, type Ref } from "react";
import styles from "./kit.module.css";

type Tone = "need" | "critical" | "live" | "text";

/* ---------- Page and head ---------- */

export function StPage({ children, width = "column", className }: { children: ReactNode; width?: "column" | "wide"; className?: string }) {
  return <div className={`${styles.page}${className ? ` ${className}` : ""}`} data-width={width}><div className={styles.pageStack}>{children}</div></div>;
}

export function StHead({ crumb, title, meta, beacon, actions, titleId, headingRef }: {
  crumb?: { label: string; href?: string; onClick?: () => void };
  title: ReactNode;
  meta?: ReactNode;
  beacon?: BeaconKind;
  actions?: ReactNode;
  titleId?: string;
  /** Stable focus destination when a saved state read replaces its controls. */
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  const crumbNode = crumb ? (crumb.href
    ? <Link className={styles.crumb} href={crumb.href} onClick={crumb.onClick}><ChevronLeft size={14} aria-hidden="true" />{crumb.label}</Link>
    : crumb.onClick ? <button type="button" className={`${styles.crumb} ${styles.textButton}`} onClick={crumb.onClick}><ChevronLeft size={14} aria-hidden="true" />{crumb.label}</button>
      : <span className={styles.crumb}>{crumb.label}</span>) : null;
  return <header className={styles.headRow}>
    <div className={styles.head}>
      {crumbNode}
      <div className={styles.titleRow}>{beacon ? <StBeacon kind={beacon} /> : null}<h1 ref={headingRef} tabIndex={headingRef ? -1 : undefined} id={titleId} className={styles.title}>{title}</h1></div>
      {meta ? <p className={styles.meta}>{meta}</p> : null}
    </div>
    {actions ? <div className={styles.headActions}>{actions}</div> : null}
  </header>;
}

export function StSection({ title, meta, action, children, id, as: As = "section" }: { title: ReactNode; meta?: ReactNode; action?: ReactNode; children: ReactNode; id?: string; as?: "section" | "div" }) {
  const generated = useId();
  const headingId = id || generated;
  return <As className={styles.section} aria-labelledby={headingId}>
    <div className={styles.sectionHead}><h2 id={headingId} className={styles.sectionTitle}>{title}</h2>{meta ? <span className={styles.sectionMeta}>{meta}</span> : null}{action ? <span className={styles.sectionAction}>{action}</span> : null}</div>
    {children}
  </As>;
}

export function StLabel({ children, as: As = "p" }: { children: ReactNode; as?: "p" | "h3" | "span" }) {
  return <As className={styles.label}>{children}</As>;
}

/* ---------- Rows ---------- */

export function StRows({ children, label }: { children: ReactNode; label?: string }) {
  return <ul className={styles.rows} aria-label={label}>{children}</ul>;
}

/** Open comparison table. On phones each record keeps its labels beside its values. */
export function StTable({ columns, rows, label }: {
  columns: readonly { key: string; label: ReactNode; mono?: boolean }[];
  rows: readonly { key: string; cells: Readonly<Record<string, ReactNode>>; label?: string }[];
  label: string;
}) {
  return <table className={styles.table} role="table" aria-label={label}>
    <thead><tr>{columns.map(column => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead>
    <tbody>{rows.map(row => <tr key={row.key} aria-label={row.label}>{columns.map((column, index) => {
      const value = <><span className={styles.cellLabel} aria-hidden="true">{column.label}</span><div className={styles.cellValue}>{column.mono ? <StMono>{row.cells[column.key]}</StMono> : row.cells[column.key]}</div></>;
      return index === 0 ? <th key={column.key} scope="row">{value}</th> : <td key={column.key}>{value}</td>;
    })}</tr>)}</tbody>
  </table>;
}

interface RowProps {
  kind?: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  lead?: ReactNode;
  end?: ReactNode;
  href?: string;
  onClick?: () => void;
  selected?: boolean;
  align?: "center" | "start";
  stackOnPhone?: boolean;
  children?: ReactNode;
}

/** One open row. With href or onClick the whole row is the control; put other actions in `end` only when the row itself isn't a link. */
export function StRow({ kind, title, detail, lead, end, href, onClick, selected, align = "center", stackOnPhone = true, children }: RowProps) {
  const body = <>{lead}<span className={styles.rowMain}>{kind ? <span className={styles.rowKind}>{kind}</span> : null}<span className={styles.rowTitle}>{title}</span>{detail ? <span className={styles.rowDetail}>{detail}</span> : null}{children}</span>{end ? <span className={styles.rowEnd}>{end}</span> : null}</>;
  const shared = { className: styles.row, "data-selected": selected || undefined, "data-align": align, "data-stack": stackOnPhone || undefined } as const;
  if (href) return <li><Link {...shared} href={href} aria-current={selected ? "true" : undefined}>{body}</Link></li>;
  if (onClick) return <li><button {...shared} type="button" onClick={onClick} aria-pressed={selected || undefined}>{body}</button></li>;
  return <li {...shared}>{body}</li>;
}

/* ---------- Marks ---------- */

export type BeaconKind = "live" | "need" | "down" | "draft";
const BEACON_LABEL: Record<BeaconKind, string> = { live: "Live", need: "Needs you", down: "Not working", draft: "Draft" };

/** A state mark. Always pair with words nearby, or pass `label` so screen readers hear it. */
export function StBeacon({ kind, pulse = false, label }: { kind: BeaconKind; pulse?: boolean; label?: string }) {
  return <span className={styles.beacon} data-kind={kind} data-pulse={pulse || undefined} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} title={label || BEACON_LABEL[kind]} />;
}

export function StState({ kind, children }: { kind: BeaconKind; children: ReactNode }) {
  return <span className={styles.state}><StBeacon kind={kind} />{children}</span>;
}

export function StMono({ children, tone, as: As = "span", dateTime }: { children: ReactNode; tone?: Tone; as?: "span" | "time"; dateTime?: string }) {
  return <As className={styles.mono} data-tone={tone} dateTime={As === "time" ? dateTime : undefined}>{children}</As>;
}

export function StKbd({ children }: { children: ReactNode }) {
  return <kbd className={styles.kbd}>{children}</kbd>;
}

export function StStamp({ children }: { children: ReactNode }) {
  return <span className={styles.stamp}><Check size={12} aria-hidden="true" />{children}</span>;
}

/* ---------- Actions ---------- */

type PillProps = ButtonHTMLAttributes<HTMLButtonElement> & { ref?: Ref<HTMLButtonElement>; variant?: "primary" | "soft"; size?: "md" | "lg"; block?: boolean; busy?: boolean };

export function StPill({ variant = "primary", size = "md", block, busy, children, disabled, ...rest }: PillProps) {
  return <button type="button" {...rest} className={styles.pill} data-variant={variant} data-size={size} data-block={block || undefined} disabled={disabled || busy} aria-busy={busy || undefined}>{busy ? <Loader2 size={16} className="motion-safe:animate-spin" aria-hidden="true" /> : null}{children}</button>;
}

export function StPillLink({ href, variant = "primary", size = "md", block, children }: { href: string; variant?: "primary" | "soft"; size?: "md" | "lg"; block?: boolean; children: ReactNode }) {
  return <Link href={href} className={styles.pill} data-variant={variant} data-size={size} data-block={block || undefined}>{children}</Link>;
}

export function StTextButton({ tone, children, href, target, rel, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { ref?: Ref<HTMLButtonElement>; tone?: "accent" | "danger"; href?: string; target?: HTMLAttributeAnchorTarget; rel?: string }) {
  if (href) return <Link href={href} target={target} rel={rel} className={styles.textButton} data-tone={tone}>{children}</Link>;
  return <button type="button" {...rest} className={styles.textButton} data-tone={tone}>{children}</button>;
}

/** Two to four mutually exclusive choices. `disabledValues` dims choices that are not allowed, with the reason in `title`. */
export function StSegmented<T extends string>({ value, options, onChange, label, disabledValues = [], disabledReason }: { value: T; options: readonly { value: T; label: string }[]; onChange?: (value: T) => void; label: string; disabledValues?: readonly T[]; disabledReason?: string }) {
  return <div className={styles.segmented} role="radiogroup" aria-label={label}>{options.map(option => {
    const disabled = disabledValues.includes(option.value);
    return <button key={option.value} type="button" role="radio" aria-checked={value === option.value} className={styles.segment} disabled={disabled || !onChange} title={disabled ? disabledReason : undefined} onClick={() => onChange?.(option.value)}>{option.label}</button>;
  })}</div>;
}

/* ---------- Steps ---------- */

export type StepState = "done" | "active" | "pending" | "failed";

export function StSteps({ steps, label }: { label: string; steps: readonly { title: ReactNode; state: StepState; time?: ReactNode; detail?: ReactNode }[] }) {
  return <ol className={styles.steps} aria-label={label}>{steps.map((step, index) => <li key={index} className={styles.step} data-state={step.state} aria-current={step.state === "active" ? "step" : undefined}>
    <span className={styles.stepMark} aria-hidden="true">{step.state === "done" ? <Check size={13} strokeWidth={2.4} /> : step.state === "active" ? <Loader2 size={13} /> : step.state === "failed" ? <X size={13} strokeWidth={2.4} /> : <Circle size={7} fill="currentColor" />}</span>
    <span className={styles.stepTitle}>{step.title}<span className="sr-only">{step.state === "done" ? ", done" : step.state === "active" ? ", in progress" : step.state === "failed" ? ", failed" : ", not started"}</span></span>
    {step.time ? <StMono>{step.time}</StMono> : <span />}
    {step.detail ? <span className={styles.stepDetail}>{step.detail}</span> : null}
  </li>)}</ol>;
}

/* ---------- Ledger ---------- */

export function StLedger({ path, count, lines, action }: { path: ReactNode; count?: ReactNode; lines: readonly { sign: "+" | "-"; text: ReactNode }[]; action?: ReactNode }) {
  return <div className={styles.ledger}>
    <div className={styles.ledgerHead}><StMono tone="text">{path}</StMono>{count ? <StMono>{count}</StMono> : null}{action ? <span style={{ marginLeft: "auto" }}>{action}</span> : null}</div>
    {lines.map((line, index) => <div key={index} className={styles.ledgerLine} data-sign={line.sign}><span className={styles.ledgerSign} aria-hidden="true">{line.sign === "+" ? "+" : "−"}</span><span><span className="sr-only">{line.sign === "+" ? "Added: " : "Removed: "}</span>{line.text}</span></div>)}
  </div>;
}

/* ---------- Hold to accept ---------- */

const HOLD_MS = 800;

/**
 * For consequential yeses (publish, confirm a booking, leave). Press and hold
 * with pointer, Space or Enter; Command/Ctrl + Enter while focused accepts at
 * once. Reduced motion keeps the hold, without the moving fill.
 */
export function StHold({ label, onAccept, disabled, block, hint = "⌘ Enter" }: { label: string; onAccept: () => void; disabled?: boolean; block?: boolean; hint?: string }) {
  const [progress, setProgress] = useState(0);
  const frame = useRef<number | null>(null);
  const start = useRef<number | null>(null);
  const done = useRef(false);
  const accept = useRef(onAccept);
  const blocked = useRef(disabled);
  const hintId = useId();

  const stop = useCallback(() => {
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = null;
    start.current = null;
    if (!done.current) setProgress(0);
  }, []);

  const begin = useCallback(() => {
    if (disabled || frame.current) return;
    done.current = false;
    start.current = performance.now();
    const tick = (now: number) => {
      if (blocked.current) { stop(); return; }
      const value = Math.min(1, (now - (start.current ?? now)) / HOLD_MS);
      setProgress(value);
      if (value >= 1) { done.current = true; frame.current = null; accept.current(); return; }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }, [disabled, stop]);

  useEffect(() => () => { if (frame.current) cancelAnimationFrame(frame.current); }, []);
  useLayoutEffect(() => { accept.current = onAccept; blocked.current = disabled; }, [onAccept, disabled]);

  return <button type="button" className={styles.hold} data-block={block || undefined} disabled={disabled} aria-label={label} aria-describedby={hintId}
    style={{ "--hold-progress": disabled ? 0 : progress } as CSSProperties}
    onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); begin(); }}
    onPointerUp={stop} onPointerCancel={stop} onPointerLeave={stop}
    onBlur={stop}
    onKeyDown={event => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); if (!event.repeat && !blocked.current) { stop(); done.current = true; accept.current(); } return; }
      if ((event.key === " " || event.key === "Enter") && !event.repeat) { event.preventDefault(); begin(); }
    }}
    onKeyUp={event => { if (event.key === " " || event.key === "Enter") stop(); }}
    onClick={event => event.preventDefault()}>
    <span className={styles.holdFill} aria-hidden="true" />
    <span className={styles.holdLabel}>{label}</span>
    <span id={hintId} className={styles.holdHint}><span className="sr-only">Press and hold, or press </span>{hint}</span>
  </button>;
}

/* ---------- Toast, surface, notice, empty ---------- */

export function StToast({ children, onUndo, undoLabel = "Undo" }: { children: ReactNode; onUndo?: () => void; undoLabel?: string }) {
  return <div className={styles.toast} role="status"><Check size={16} aria-hidden="true" /><span>{children}</span>{onUndo ? <><StTextButton onClick={onUndo}>{undoLabel}</StTextButton><StKbd>⌘ Z</StKbd></> : null}</div>;
}

/** A bordered surface. Only for real objects: a draft, a preview, a receipt, a form. Never to group a list. */
export function StSurface({ children, tone, pad = true, label }: { children: ReactNode; tone?: "need"; pad?: boolean; label?: string }) {
  return <div className={`${styles.surface}${pad ? ` ${styles.surfacePad}` : ""}`} data-tone={tone} role={label ? "group" : undefined} aria-label={label}>{children}</div>;
}

export function StNotice({ children, tone, icon }: { children: ReactNode; tone?: "need" | "critical"; icon?: ReactNode }) {
  return <div className={styles.notice} data-tone={tone} role={tone === "critical" ? "alert" : undefined}>{icon}<div>{children}</div></div>;
}

/** An empty state that says what is true and offers the next step. */
export function StEmpty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <div className={styles.empty}><span>{children}</span>{action}</div>;
}

export function StSkeleton({ width = "100%", label = "Loading" }: { width?: string; label?: string }) {
  return <span className={styles.skeleton} style={{ width }} role="status" aria-label={label} />;
}

/* ---------- Composer ---------- */

/** The floating Ask Strelva bar. Visual only: the caller owns submission and authority. */
export function StComposerBar({ scope, placeholder, value, onChange, onSubmit, disabled, inputLabel = "Ask Strelva" }: { scope?: string; placeholder: string; value: string; onChange: (value: string) => void; onSubmit: () => void; disabled?: boolean; inputLabel?: string }) {
  return <form className={styles.composer} onSubmit={event => { event.preventDefault(); if (value.trim()) onSubmit(); }}>
    {scope ? <span className={styles.composerScope}><StBeacon kind="live" />{scope}</span> : null}
    <input className={styles.composerInput} aria-label={inputLabel} placeholder={placeholder} value={value} onChange={event => onChange(event.target.value)} disabled={disabled} />
    <button className={styles.composerSend} type="submit" aria-label="Send" disabled={disabled || !value.trim()}><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
  </form>;
}

export function StComposerDock({ children }: { children: ReactNode }) {
  return <div className={styles.composerDock}>{children}</div>;
}
