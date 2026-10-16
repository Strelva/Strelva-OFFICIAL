"use client";
/**
 * XA surfaces. Pen: LX · Page (viaGc), In · Confirm sheet (zY9qV),
 * C3 · Empty · First run (xLm8z), the open rows of AG1/O6, the two-tone
 * headline and answer rows of O3, and the "Since yesterday" lines of O1.
 *
 * Surfaces hold real objects only: a page as visitors see it, the decision,
 * a confirmation. Lists are open rows with a hairline between, never cards.
 */
import Link from "next/link";
import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { XaPebbleAvatar, XaPebbleScene, type XaPose } from "./characters";
import styles from "./xa.module.css";

/* ---------- Page ---------- */

/** A page the way its visitors see it: the address, then the content. */
export function XaPage({ address, title, children, replaces, flat = false, label }: { address: string; title?: ReactNode; children?: ReactNode; replaces?: ReactNode; flat?: boolean; label?: string }) {
  return <figure className={styles.page} data-flat={flat || undefined} aria-label={label ?? `${address}, as visitors see it`} style={{ margin: 0 }}>
    <div className={styles.pageAddress}><Lock size={12} aria-hidden="true" /><span>{address}</span></div>
    <div className={styles.pageBody}>
      {title ? <p className={styles.pageTitle}>{title}</p> : null}
      {children}
      {replaces ? <figcaption className={styles.pageNote}>Replaces “{replaces}”</figcaption> : null}
    </div>
  </figure>;
}

/** The new words inside a Page, tinted moss so the change is the first thing seen. */
export function XaPageChange({ children }: { children: ReactNode }) {
  return <p className={styles.pageChange}><span className={styles.srOnly}>New wording: </span>{children}</p>;
}

/* ---------- Words ---------- */

/** What happened, then what it means for the reader in a quieter tone. Never the same sentence twice. */
export function XaHeadline({ children, quiet, size = "md", as: Heading = "h1", id }: { children: ReactNode; quiet?: ReactNode; size?: "sm" | "md" | "lg"; as?: "h1" | "h2"; id?: string }) {
  return <Heading id={id} className={styles.headline} data-size={size}>{children}{quiet ? <span className={styles.headlineQuiet}> {quiet}</span> : null}</Heading>;
}

export function XaLede({ children }: { children: ReactNode }) {
  return <p className={styles.lede}>{children}</p>;
}

/** Plain answers to what a careful owner asks, one line each. */
export function XaAnswers({ rows, labelWidth }: { rows: readonly (readonly [ReactNode, ReactNode])[]; labelWidth?: number }) {
  return <dl className={styles.answers} style={labelWidth ? { "--xa-answer-label": `${labelWidth}px` } as CSSProperties : undefined}>
    {rows.map(([label, value], index) => <div key={index} className={styles.answer}><dt>{label}</dt><dd>{value}</dd></div>)}
  </dl>;
}

/** A sentence-case label: 13/500, never uppercase, never letter-spaced. */
export function XaLabel({ children, as: Tag = "p", id }: { children: ReactNode; as?: "p" | "h2" | "h3"; id?: string }) {
  return <Tag id={id} className={styles.label}>{children}</Tag>;
}

/** Times beside sentences, oldest first (O1 "Since yesterday"). Each sentence names whoever acted. */
export function XaLines({ lines, label }: { lines: readonly { time: string; dateTime?: string; text: ReactNode }[]; label: string }) {
  return <ul className={styles.lines} aria-label={label}>{lines.map((line, index) => <li key={index}><time dateTime={line.dateTime}>{line.time}</time><span>{line.text}</span></li>)}</ul>;
}

/** Strelva speaking: Pebble's face, one plain sentence, then text links ("See it · Undo"). */
export function XaSays({ children, links }: { children: ReactNode; links?: readonly ReactNode[] }) {
  return <div className={styles.says}><XaPebbleAvatar size={32} /><p>{children}{links?.length ? <span className={styles.saysLinks}>{links.map((link, index) => <span key={index}>{index ? "· " : ""}{link}</span>)}</span> : null}</p></div>;
}

/* ---------- Rows ---------- */

export function XaRows({ children, label }: { children: ReactNode; label: string }) {
  return <ul className={styles.rows} aria-label={label}>{children}</ul>;
}

interface RowProps {
  /** A System tile, a client initial or Pebble. */
  lead?: ReactNode;
  title: ReactNode;
  /** One line of fact. Tone "waits" turns it clay, for the one row that needs someone. */
  detail?: ReactNode;
  tone?: "waits";
  /** Quiet right-hand fact: a time, a count. */
  meta?: ReactNode;
  /** One action. Only when the row itself is not a link. */
  action?: ReactNode;
  href?: string;
  onClick?: () => void;
  current?: boolean;
  wrapOnPhone?: boolean;
}

/** An open row with a hairline above it. With href or onClick the whole row is the control. */
export function XaRow({ lead, title, detail, tone, meta, action, href, onClick, current, wrapOnPhone = true }: RowProps) {
  const body = <>{lead}<span className={styles.rowText}><span className={styles.rowTitle}>{title}</span>{detail ? <span className={styles.rowDetail} data-tone={tone}>{detail}</span> : null}</span>{meta ? <span className={styles.rowMeta}>{meta}</span> : null}{action ? <span className={styles.rowEnd}>{action}</span> : null}</>;
  if (href) return <li><Link className={styles.row} href={href} aria-current={current ? "page" : undefined} data-wrap={wrapOnPhone || undefined} onClick={onClick ? event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault(); onClick();
  } : undefined}>{body}</Link></li>;
  if (onClick) return <li><button type="button" className={styles.row} onClick={onClick} aria-pressed={current || undefined} data-wrap={wrapOnPhone || undefined}>{body}</button></li>;
  return <li><div className={styles.row} data-wrap={wrapOnPhone || undefined}>{body}</div></li>;
}

/* ---------- Empty ---------- */

/**
 * An empty or quiet state with Pebble doing a job. `job` says what Pebble is
 * doing right now; it is required because Pebble is never idle decoration.
 */
export function XaEmpty({ pose, job, title, children, action, secondary, size = "md", align = "start" }: { pose: XaPose; job: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode; secondary?: ReactNode; size?: "sm" | "md"; align?: "start" | "center" }) {
  return <section className={styles.empty} data-size={size} data-align={align} aria-label={typeof title === "string" ? title : undefined}>
    <XaPebbleScene pose={pose} size={size === "sm" ? 140 : 200} />
    <h2 className={styles.emptyTitle}>{title}</h2>
    {children ? <p className={styles.emptyBody}>{children}</p> : null}
    <p className={styles.emptyJob}><span className={styles.pulse} aria-hidden="true" />{job}</p>
    {action || secondary ? <div className={styles.emptyActions}>{action}{secondary}</div> : null}
  </section>;
}

/* ---------- Sheet ---------- */

/**
 * A confirmation that needs its own moment (remove an agency, take the
 * business away). Native <dialog>: focus moves in, Escape closes, focus
 * returns to the opener. Never for an inline task.
 */
export function XaSheet({ open, onClose, title, children, actions, art }: { open: boolean; onClose: () => void; title: ReactNode; children?: ReactNode; actions: ReactNode; art?: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const titleId = useId();
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    // A sheet that confirms something destructive marks its safe choice with data-sheet-focus, so focus never lands on the destructive pill.
    if (open && !node.open) { opener.current = document.activeElement; node.showModal(); node.querySelector<HTMLElement>("[data-sheet-focus]")?.focus(); }
    if (!open && node.open) { node.close(); if (opener.current instanceof HTMLElement) opener.current.focus(); }
  }, [open]);
  return <dialog ref={dialog} className={styles.sheet} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={styles.sheetBody}>
      {art}
      <h2 id={titleId} className={styles.sheetTitle}>{title}</h2>
      {children}
      <div className={styles.sheetActions}>{actions}</div>
    </div>
  </dialog>;
}
