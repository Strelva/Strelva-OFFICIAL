"use client";
/**
 * XA object pages (October 16, 2026, lane xs-apps-care).
 *
 * The XA-4 and XA-6 screens (S4 form in Draft, S6 Versions, AG4 prepare and
 * send) share one composition: what this is and what it means on the left,
 * the one object it is about on the right. XaObjectPage is that composition;
 * XaOutside is the paper frame for pages people open from a link, outside the
 * workspace (a shared report, a buyer's home search, a delivery status).
 *
 * Candidates for the kit in src/components/ui/strelva/Xa once a second lane
 * needs them. They only arrange; every visible part is an Xa* kit part.
 */
import Link from "next/link";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { XaInitial, XaMark } from "@/components/ui/strelva/Xa";
import styles from "./object-page.module.css";

/** Story left, object right (sticky on desktop). On a phone the object follows the story. */
export function XaObjectPage({ story, object, label, objectFirstOnPhone = false, wide = false }: { story: ReactNode; object?: ReactNode; label?: string; objectFirstOnPhone?: boolean; wide?: boolean }) {
  return <div className={styles.page} data-single={!object || undefined} data-wide={wide || undefined} data-object-first={objectFirstOnPhone || undefined} aria-label={label}>
    <div className={styles.story}>{story}</div>
    {object ? <div className={styles.object}>{object}</div> : null}
  </div>;
}

/** "Harbor Dental / Website / Hours", quiet, each part a link when it has somewhere to go. */
export function XaCrumbs({ items }: { items: readonly { label: string; href?: string }[] }) {
  return <nav aria-label="You are here" className={styles.crumbs}>
    {items.map((item, index) => <span key={`${item.label}-${index}`}>
      {index ? <span aria-hidden="true" className={styles.crumbGap}>/</span> : null}
      {item.href ? <Link href={item.href}>{item.label}</Link> : <span aria-current={index === items.length - 1 ? "page" : undefined}>{item.label}</span>}
    </span>)}
  </nav>;
}

/** One figure that matters (E3 "14 visits booked"), with its sentence beside it. Never a row of them. */
export function XaFigure({ value, label, detail }: { value: ReactNode; label: ReactNode; detail?: ReactNode }) {
  return <p className={styles.figure}><span className={styles.figureValue}>{value}</span><span className={styles.figureText}><span>{label}</span>{detail ? <small>{detail}</small> : null}</span></p>;
}

/** A section inside a story or a document: a sentence-case label, then its content. */
export function XaBlock({ label, children, action, id }: { label: ReactNode; children: ReactNode; action?: ReactNode; id?: string }) {
  return <section className={styles.block} aria-labelledby={id}>
    <div className={styles.blockHead}><h2 id={id} className={styles.blockLabel}>{label}</h2>{action ? <span className={styles.blockAction}>{action}</span> : null}</div>
    {children}
  </section>;
}

/** Changes with when, what and who acted (E3 "What changed"). */
export function XaChanges({ rows, label }: { rows: readonly { key: string; when: string; dateTime?: string; text: ReactNode; who?: ReactNode; tone?: "waits" | "quiet" }[]; label: string }) {
  return <ul className={styles.changes} aria-label={label}>
    {rows.map(row => <li key={row.key} data-tone={row.tone}>
      <time dateTime={row.dateTime}>{row.when}</time>
      <span className={styles.changeText}>{row.text}</span>
      {row.who ? <span className={styles.changeWho}>{row.who}</span> : null}
    </li>)}
  </ul>;
}

/** A plain sentence of status or result inside a page, with no box (the decision sits beside the thing it changes). */
export function XaNote({ children, tone, role }: { children: ReactNode; tone?: "waits" | "down" | "done"; role?: "status" | "alert" }) {
  return <p className={styles.note} data-tone={tone} role={role}>{children}</p>;
}

/**
 * The paper frame for a page opened from a link: who it is from on the left
 * (an agency, a brokerage, a business), a quiet line on the right, then one
 * calm column. `credit` adds "Runs on Strelva" after an agency's name.
 */
export function XaOutside({ from, color, logoUrl, credit = false, meta, mode = "light", width = "reading", children, label }: {
  from: string | null;
  color?: string;
  logoUrl?: string | null;
  credit?: boolean;
  meta?: ReactNode;
  mode?: "light" | "dark";
  width?: "reading" | "wide";
  children: ReactNode;
  label?: string;
}) {
  return <main data-dashboard data-workspace-theme="linen" data-workspace-mode={mode} className={styles.outside} aria-label={label}>
    <header className={styles.outsideHead}>
      <span className={styles.outsideFrom}>
        {from ? <>{logoUrl ? <img src={logoUrl} alt="" width={26} height={26} className={styles.outsideLogo} /> : <XaInitial name={from} color={color} size={26} />}<span>{from}</span>{credit ? <span className={styles.outsideCredit}>Runs on Strelva</span> : null}</> : <><XaMark size={24} /><span>Strelva</span></>}
      </span>
      {meta ? <span className={styles.outsideMeta}>{meta}</span> : null}
    </header>
    <div className={styles.outsideColumn} data-width={width}>{children}</div>
  </main>;
}

/**
 * Where something is, as an order page shows it: done steps settle to gray
 * with a moss check, the current one is ink and says what is happening, the
 * next ones wait in gray. Steps come from real recorded dates, never timers.
 */
export function XaSteps({ steps, label }: { steps: readonly { key?: string; title: ReactNode; state: "done" | "active" | "pending"; time?: ReactNode; detail?: ReactNode }[]; label: string }) {
  return <ol className={styles.steps} aria-label={label}>
    {steps.map((step, index) => <li key={step.key ?? index} className={styles.step} data-state={step.state} aria-current={step.state === "active" ? "step" : undefined}>
      <span className={styles.stepMark} aria-hidden="true">{step.state === "done" ? <Check size={14} strokeWidth={2.4} /> : null}</span>
      <span className={styles.stepText}>
        <span className={styles.stepTitle}>{step.title}<span className="sr-only">{step.state === "done" ? ", done" : step.state === "active" ? ", happening now" : ", next"}</span></span>
        {step.time ? <span className={styles.stepTime}>{step.time}</span> : null}
        {step.detail ? <span className={styles.stepDetail}>{step.detail}</span> : null}
      </span>
    </li>)}
  </ol>;
}
