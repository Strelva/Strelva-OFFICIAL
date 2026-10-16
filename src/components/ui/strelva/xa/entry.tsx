/**
 * XA entry: the frame for getting in, before a business has a workspace
 * shell. Pen: XA · B1–B5 (T5dNV, K5GJ0c, W1oNFU, WfW7X, J22w90) and the same
 * frame in XA · A1–A2 for agencies.
 *
 * Paper on the left with the lockup, one column and a quiet note. The felt
 * stage on the right shows Pebble doing the job this step is about, with one
 * caption that says what happens next. Below 1024 px the stage steps aside:
 * the column is the screen, and Pebble speaks where Strelva speaks.
 *
 * Added by lane XA-1 (business door). The kit lacked an entry frame; agency
 * entry (XA-2) can use the same parts.
 */
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { StrelvaLockup } from "@/components/brand/StrelvaLockup";
import { XaPebbleScene, type XaPose } from "./characters";
import styles from "./entry.module.css";

export interface XaEntryStage {
  pose: XaPose;
  /** What Pebble is doing, for screen readers. */
  label: string;
  title: ReactNode;
  body?: ReactNode;
  /** A real object beside Pebble, such as the page that was read. */
  object?: ReactNode;
}

/** The entry frame. `account` sits top right (Sign in, or the signed-in person). */
export function XaEntry({ children, account, foot, stage, mode, width = "form", homeHref = "/", brand }: {
  children: ReactNode;
  /**
   * The agency whose door this is (an invitation or a claim). Owners see their
   * agency's name, never Strelva in its place; foot then says "Runs on Strelva".
   */
  brand?: { name: string; logoUrl?: string | null };
  account?: ReactNode;
  foot?: ReactNode;
  stage?: XaEntryStage;
  mode?: "light" | "dark";
  width?: "form" | "wide";
  homeHref?: string;
}) {
  return <main className={styles.entry} data-workspace-theme="linen" data-workspace-mode={mode} data-staged={stage ? true : undefined}>
    <div className={styles.left}>
      <header className={styles.top}>
        {brand ? <span className={styles.brand}>{brand.logoUrl ? <img src={brand.logoUrl} alt="" width={24} height={24} /> : null}{brand.name}</span>
          : <Link href={homeHref} className={styles.home} aria-label="Strelva home"><StrelvaLockup className={styles.lockup} /></Link>}
        {account ? <div className={styles.account}>{account}</div> : null}
      </header>
      <div className={styles.column} data-width={width}>{children}</div>
      {foot ? <footer className={styles.foot}>{foot}</footer> : null}
    </div>
    {stage ? <aside className={styles.stage} aria-label={stage.label}>
      <div className={styles.art} style={{ "--xa-art": `${stage.object ? 300 : 440}px` } as CSSProperties}><XaPebbleScene pose={stage.pose} size={stage.object ? 300 : 440} bare label={stage.label} /></div>
      {stage.object ? <div className={styles.object}>{stage.object}</div> : null}
      <div className={styles.caption}>
        <p className={styles.captionTitle}>{stage.title}</p>
        {stage.body ? <p className={styles.captionBody}>{stage.body}</p> : null}
      </div>
    </aside> : null}
  </main>;
}

/** Where this person is in getting started. Done steps stay moss; the current one is named in ink. */
export function XaEntrySteps({ steps, current, label = "Getting started" }: { steps: readonly string[]; current: number; label?: string }) {
  return <ol className={styles.steps} aria-label={label} style={{ "--xa-steps": steps.length } as CSSProperties}>
    {steps.map((step, index) => <li key={step} className={styles.step} data-done={index < current || undefined} aria-current={index === current ? "step" : undefined}>
      <span className={styles.stepBar} aria-hidden="true" />
      <span>{step}<span className={styles.srOnly}>{index < current ? ", done" : index === current ? ", current step" : ""}</span></span>
    </li>)}
  </ol>;
}

/**
 * Two doors as links in a segmented track (I run a business / I run work for
 * clients). Each is a page of its own, so it works before any script loads.
 */
export function XaEntryDoors({ label, options }: { label: string; options: readonly { href: string; label: string; current: boolean }[] }) {
  return <nav className={styles.doors} aria-label={label}>
    {options.map(option => <Link key={option.href} href={option.href} className={styles.door} aria-current={option.current ? "page" : undefined}>{option.label}</Link>)}
  </nav>;
}
