"use client";
/**
 * XA · AG2 · The Queue (Pen cvfIj).
 *
 * Two groups and nothing else: what waits on the agency, then what waits on
 * owners. The oldest broken thing carries the screen's one ink pill; every
 * other row has a white action or a text link. Owner rows read
 * "Waiting on [business]" (GLOSSARY: Queue) and never offer the owner's yes.
 */
import type { ReactNode } from "react";
import { StSkeleton } from "@/components/ui/strelva/Kit";
import { XaButton, XaEmpty, XaHeadline, XaInitial, XaLabel, XaRow, XaRows, XaSays, XaTextLink } from "@/components/ui/strelva/Xa";
import { AgencyFold } from "./AgencyFold";
import { lapseLabel } from "@/platform/owner-reach/model";
import type { AgencyQueueItem } from "../../agency-clients";
import { clockLabel, queueActionLabel, queueDetail, queueHeadline, splitQueue } from "./agency-xa-model";
import { clientColor } from "@/platform/presentation/client-color";
import styles from "./agency-xa.module.css";

export interface AgencyQueueXaProps {
  status: "loading" | "error" | "ready";
  items: readonly AgencyQueueItem[];
  /** False when some clients or sources were not read; the Queue says so. */
  complete: boolean;
  gaps?: readonly string[];
  loaded?: { clients: number; total: number };
  now: number;
  onOpen: (item: AgencyQueueItem) => void;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  onRetry: () => void;
  /** Incoming proposals from businesses, shown above the rows when present. */
  proposals?: ReactNode;
  /**
   * Requests addressed to the agency and assigned drafts, folded below.
   * `count` is null while any part is still being read; at 0 the fold hides
   * but stays mounted so its parts can keep reporting.
   */
  more?: { content: ReactNode; count: number | null };
  /** Pebble's latest pass over shared Systems, for the empty Queue. */
  checks?: { systems: number; at: string | null };
}

export function AgencyQueueXa({ status, items, complete, gaps = [], loaded, now, onOpen, onLoadMore, loadingMore, onRetry, proposals, more, checks }: AgencyQueueXaProps) {
  if (status === "loading") return <div className={styles.column} role="status" aria-label="Checking work across clients">
    <XaHeadline>Checking every client…</XaHeadline>
    <div className={styles.skeletonRows}>{[88, 70, 80].map(width => <StSkeleton key={width} width={`${width}%`} />)}</div>
  </div>;

  if (status === "error") return <div className={styles.state}>
    <XaEmpty pose="fixing" job="Pebble kept the Queue as it was. Nothing was sent or changed." title="The Queue didn't load." action={<XaButton variant="primary" onClick={onRetry}>Try again</XaButton>} />
  </div>;

  const { you, owners } = splitQueue(items);
  const { line, quiet } = queueHeadline(you.length, owners.length);
  const incomplete = !complete || gaps.length > 0;

  return <div className={styles.column}>
    <XaHeadline quiet={quiet ?? undefined}>{line}</XaHeadline>
    {proposals}
    {incomplete ? <div role="alert" className={styles.group}>
      <p className={styles.inlineAlert}>This Queue is incomplete. {loaded && loaded.clients < loaded.total ? `It holds ${loaded.clients} of ${loaded.total} clients.` : "Some sources could not be read."}{gaps.length ? ` ${gaps.join(" · ")}.` : ""}</p>
      {onLoadMore && loaded && loaded.clients < loaded.total ? <p className={styles.note}><XaTextLink onClick={loadingMore ? undefined : onLoadMore}>{loadingMore ? "Reading more clients…" : "Read the rest of your clients"}</XaTextLink></p> : null}
    </div> : null}

    {!you.length && !owners.length && !incomplete ? <XaSays>{checks?.systems
      ? `Pebble checked ${checks.systems} ${checks.systems === 1 ? "System" : "Systems"}${checks.at ? ` at ${clockLabel(new Date(checks.at))}` : ""}. Anything that breaks shows here first.`
      : "Pebble checks every client's Systems and shows anything that breaks here first."}</XaSays> : null}

    {you.length ? <section className={styles.group} aria-labelledby="queue-you">
      <XaLabel id="queue-you" as="h2">Waiting on you</XaLabel>
      <XaRows label="Waiting on you, broken first, oldest first">
        {you.map((item, index) => <XaRow key={`${item.workspaceId}:${item.id}`}
          lead={<XaInitial name={item.clientName} color={clientColor(item.workspaceId)} size={36} />}
          title={item.title} detail={queueDetail(item, now)}
          action={<XaButton size="sm" variant={index === 0 ? "primary" : "secondary"} onClick={() => onOpen(item)} aria-label={`${queueActionLabel(item)}: ${item.title}, ${item.clientName}`}>{queueActionLabel(item)}</XaButton>} />)}
      </XaRows>
    </section> : null}

    {owners.length ? <section className={styles.group} aria-labelledby="queue-owners">
      <XaLabel id="queue-owners" as="h2">Waiting on owners</XaLabel>
      <XaRows label="Waiting on owners, oldest first">
        {owners.map(item => <XaRow key={`${item.workspaceId}:${item.id}`}
          lead={<XaInitial name={item.clientName} color={clientColor(item.workspaceId)} size={36} />}
          title={item.title}
          detail={<>{queueDetail(item, now)}{item.expiresAt && lapseLabel(item.expiresAt, now) ? ` · ${lapseLabel(item.expiresAt, now)!.toLowerCase()}` : ""}</>}
          action={<XaTextLink onClick={() => onOpen(item)} aria-label={`See it: ${item.title}, ${item.clientName}`}>See it</XaTextLink>} />)}
      </XaRows>
      <p className={styles.note}>Only each owner can say yes. Their decision shows here the moment they make it.</p>
    </section> : null}

    {more ? <AgencyFold hidden={more.count === 0} label={more.count ? `${more.count} more ${more.count === 1 ? "request or draft" : "requests and drafts"}` : "More requests and drafts"}>{more.content}</AgencyFold> : null}
  </div>;
}
