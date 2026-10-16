"use client";
/**
 * Page parts for the legacy website dashboard, composed from the LX kit.
 * They hold layout and words only; every page keeps its own data loading,
 * permissions and writes.
 */
import { useSyncExternalStore, type ReactNode } from "react";
import { greetingName, todayGreeting } from "@/experience/workspace/today/today-model";
import { StSkeleton } from "@/components/ui/strelva/Kit";
import { XaEmpty, XaHeadline, XaLede } from "@/components/ui/strelva/Xa";
import type { XaPose } from "@/components/ui/strelva/Xa";
import styles from "./dashboard-xa.module.css";

/** One page: a two-tone headline that never repeats itself, an optional lede, then the work. */
export function DashPage({ title, quiet, lede, lead, actions, children, width = "md", scroll = true, label }: {
  title: ReactNode;
  /** What the title means for the reader, in a quieter tone. */
  quiet?: ReactNode;
  lede?: ReactNode;
  /** A System tile or initial beside the headline. */
  lead?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  width?: "narrow" | "md" | "wide";
  scroll?: boolean;
  label?: string;
}) {
  const page = <div className={styles.page} data-width={width}>
    <div className={styles.column}>
      <header className={styles.head}>
        <div className={styles.lead}>
          {lead}
          <div className={styles.headText}>
            <XaHeadline size="sm" quiet={quiet}>{title}</XaHeadline>
            {lede ? <XaLede>{lede}</XaLede> : null}
          </div>
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </header>
      {children}
    </div>
  </div>;
  return scroll ? <div className={styles.scroll} aria-label={label}>{page}</div> : page;
}

/** A labelled part of a page. The label is sentence case at 13/500. */
export function DashSection({ label, aside, children, id }: { label: ReactNode; aside?: ReactNode; children: ReactNode; id?: string }) {
  return <section className={styles.section} id={id} aria-label={typeof label === "string" ? label : undefined}>
    <div className={styles.sectionHead}><h2>{label}</h2>{aside ? <span className={styles.sectionAside}>{aside}</span> : null}</div>
    {children}
  </section>;
}

/**
 * Status as a sentence beside the work it changes: a dot, the words, then
 * text links ("Update your card · Message Strelva"). Not a banner.
 */
export function DashNote({ tone = "quiet", children, links, role }: { tone?: "waits" | "down" | "live" | "quiet"; children: ReactNode; links?: readonly ReactNode[]; role?: "status" | "alert" }) {
  return <p className={styles.note} data-tone={tone} role={role}>
    <span className={styles.noteDot} aria-hidden="true" />
    <span className={styles.noteText}>{children}{links?.length ? <span className={styles.noteLinks}>{links.map((link, index) => <span key={index}>{index ? "· " : ""}{link}</span>)}</span> : null}</span>
  </p>;
}

/** Shell-level notes (inspection, admin, billing) stacked above the page as sentences. */
export function DashShellNotes({ children }: { children: ReactNode }) {
  return <div className={styles.shellNotes}>{children}</div>;
}

export function DashProse({ children }: { children: ReactNode }) {
  return <p className={styles.prose}>{children}</p>;
}

/** Loading lines in the page's own shape: a headline, then rows. */
export function DashLoading({ label = "Loading", rows = 4 }: { label?: string; rows?: number }) {
  return <div className={styles.page} aria-busy="true">
    <div className={styles.column}>
      <div className={styles.skeleton}><StSkeleton width="44%" label={label} /><StSkeleton width="28%" label={label} /></div>
      <div className={styles.skeleton}>{Array.from({ length: rows }, (_, index) => <StSkeleton key={index} width={`${92 - index * 9}%`} label={label} />)}</div>
    </div>
  </div>;
}

/** An empty, closed or failed page with Pebble doing the job that matters. */
export function DashEmpty({ pose, job, title, children, action, secondary }: { pose: XaPose; job: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode; secondary?: ReactNode }) {
  return <div className={styles.center}><XaEmpty pose={pose} job={job} title={title} action={action} secondary={secondary} align="start">{children}</XaEmpty></div>;
}

export const dashStyles = styles;

/** The minute, on the client only; the server and hydration greet without a clock. */
function subscribeMinute(onChange: () => void) {
  const timer = window.setInterval(onChange, 30_000);
  return () => window.clearInterval(timer);
}
const minuteNow = () => Math.floor(Date.now() / 60_000);
const noMinute = () => null;

/**
 * Home's greeting, in the workspace's words (todayGreeting): "Good morning,
 * Dr. Lin." by the reader's own clock. A business name or "there" in the
 * name slot (old tenant records) greets without a name, never "Good morning, Great."
 */
export function DashGreeting({ name, businessName }: { name: string; businessName: string }) {
  const minute = useSyncExternalStore(subscribeMinute, minuteNow, noMinute);
  const raw = name.trim();
  const who = raw && raw !== businessName.trim() && raw !== "there" ? greetingName(raw) : null;
  return <XaHeadline size="lg">{todayGreeting(minute, who)}</XaHeadline>;
}
