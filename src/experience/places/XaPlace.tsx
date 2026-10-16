/**
 * XA place frame for the owner and agency places that read like XA · S3
 * (Inbox): a head with the System clay, a one-line status, a view switch on
 * the right, then the place's one dominant object. Used by Leads, Reviews,
 * Recaps, Results and Prospects (lane xs-leads, October 15, 2026). Built only
 * from the XA kit (@/components/ui/strelva/Xa) and workspace tokens.
 *
 * Server-safe: nothing here holds state, so server places can use it.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { StSkeleton } from "@/components/ui/strelva/Kit";
import { XaButtonLink, XaHeadline, XaPebbleScene, XaPebbleAvatar } from "@/components/ui/strelva/Xa";
import styles from "./xa-place.module.css";

/** The place's paper. `width="read"` is one 720 column; `wide` holds a list beside a detail. */
export function XaPlace({ children, width = "wide", label }: { children: ReactNode; width?: "wide" | "read"; label?: string }) {
  return <div className={styles.place} data-width={width} aria-label={label}>{children}</div>;
}

/**
 * The head of a place (S3): art, the place name, one line of what is true now
 * (an exception status first, then a plain sentence) and, on the right, the
 * one view switch. `back` is a quiet link home.
 */
export function XaPlaceHead({ art, title, status, aside, back, titleId }: { art?: ReactNode; title: ReactNode; status?: ReactNode; aside?: ReactNode; back?: { href: string; label: string }; titleId?: string }) {
  return <header className={styles.head}>
    {back ? <Link className={styles.back} href={back.href}>{back.label}</Link> : null}
    <div className={styles.headRow}>
      {art ? <span className={styles.headArt}>{art}</span> : null}
      <div className={styles.headText}>
        <h1 id={titleId} className={styles.title}>{title}</h1>
        {status ? <div className={styles.status}>{status}</div> : null}
      </div>
      {aside ? <div className={styles.headAside}>{aside}</div> : null}
    </div>
  </header>;
}

/**
 * A segmented control whose options are addresses (period, time window).
 * Looks like XaSegmented; the page swaps instantly, the way XA navigation does.
 */
export function XaLinkSegmented({ label, options }: { label: string; options: readonly { href: string; label: string; current: boolean }[] }) {
  return <nav className={styles.segmented} aria-label={label}>
    {options.map(option => <Link key={option.href} href={option.href} className={styles.segment} aria-current={option.current ? "page" : undefined}>{option.label}</Link>)}
  </nav>;
}

/** The one big number a place is about (E3 "14 visits booked online"). */
export function XaFigure({ value, label, note, id }: { value: ReactNode; label: ReactNode; note?: ReactNode; id?: string }) {
  return <div className={styles.figure} id={id}>
    <span className={styles.figureValue}>{value}</span>
    <span className={styles.figureText}><span className={styles.figureLabel}>{label}</span>{note ? <span className={styles.figureNote}>{note}</span> : null}</span>
  </div>;
}

/** Bad news, with Pebble in frame already on it, and one way forward. */
export function XaPlaceTrouble({ title, quiet, children, action, pose = "fixing", role = "alert" }: { title: ReactNode; quiet?: ReactNode; children?: ReactNode; action?: ReactNode; pose?: "fixing" | "resting" | "waving"; role?: "alert" | "status" }) {
  return <section className={styles.trouble} role={role}>
    <XaPebbleScene pose={pose} size={180} />
    <XaHeadline as="h2" size="sm" quiet={quiet}>{title}</XaHeadline>
    {children ? <div className={styles.troubleBody}>{children}</div> : null}
    {action ? <div className={styles.troubleActions}>{action}</div> : null}
  </section>;
}

/** The permission state every owner place shares. */
export function XaPlaceNotMember({ title = "This belongs to another business." }: { title?: string }) {
  return <XaPlaceTrouble pose="waving" title={title} action={<XaButtonLink href="/workspace">Open your workspace</XaButtonLink>}>
    <p>Your account isn&apos;t a member of this business. Ask its owner to invite you, or open your own workspace.</p>
  </XaPlaceTrouble>;
}

/** Loading: the head's shape and the list's shape, never a spinner page. */
export function XaPlaceLoading({ label }: { label: string }) {
  return <div className={styles.loading} aria-busy="true">
    <StSkeleton label={label} width="42%" />
    <StSkeleton width="78%" />
    <StSkeleton width="64%" />
  </div>;
}

/** Strelva saying one plain sentence inline, smaller than XaSays, for list footers and in-pane notes. */
export function XaNote({ children, tone, pebble = false, role }: { children: ReactNode; tone?: "waits" | "trouble"; pebble?: boolean; role?: "status" | "alert" }) {
  return <div className={styles.note} data-tone={tone} role={role}>{pebble ? <XaPebbleAvatar size={24} /> : null}<p>{children}</p></div>;
}

/** Deterministic short date (server and browser agree): "Oct 12". */
export function xaShortDate(value: string): string {
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Stars as text, with the rating said once for screen readers. */
export function XaStars({ rating }: { rating: number }) {
  const value = Math.max(0, Math.min(5, Math.round(rating)));
  return <span className={styles.stars} role="img" aria-label={`${value} out of 5 stars`}>{"★".repeat(value)}<span className={styles.starsOff}>{"★".repeat(5 - value)}</span></span>;
}
