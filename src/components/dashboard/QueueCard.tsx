"use client";

import { useState } from "react";
import type { UnifiedEvent } from "@/lib/types";
import { XaButton, XaLabel, XaPage, XaPageChange, XaPebbleAvatar, XaStatus, XaSystemTile, XaTextLink, XaYes } from "@/components/ui/strelva/Xa";
import type { PreviewDiff } from "@/lib/agent-risk";
import { UseAsTestimonialModal } from "./UseAsTestimonialModal";
import { useDashboardOptional } from "./DashboardContext";
import styles from "./queue.module.css";

/**
 * One thing that waits, as an open row (XA · O5). Opened, it becomes the
 * decision in place: the page as visitors will see it with the new words
 * tinted, then the one yes (XA · O3) with the workspace's one way out, "Not
 * yet": it turns the change down and nothing on the site changes, as Not yet
 * does on workspace Home. Closing the row keeps it waiting.
 */

// Owner-facing label for an event's source, never the raw internal slug.
const SOURCE_LABELS: Record<string, string> = {
  google: "Google",
  yelp: "Yelp",
  instagram: "Instagram",
  ai: "Strelva",
  website: "Your website",
  calendly: "Booking",
  vegaro: "Booking",
  stripe: "Payment",
};

function formatEventSource(source: string): string {
  return SOURCE_LABELS[source] ?? "Activity";
}

const SOURCE_CLAY: Record<string, string> = {
  google: "reviews", yelp: "reviews", calendly: "bookings", vegaro: "bookings", website: "inbox", stripe: "payments", instagram: "newsletter",
};

export function queueLead(event: UnifiedEvent, size = 36) {
  if (event.type === "change_request") return <XaSystemTile kind="website" size={size} />;
  if (event.type === "newsletter_draft") return <XaSystemTile kind="newsletter" size={size} />;
  if (event.metadata?.kind === "gbp_post_draft" || event.metadata?.kind === "gbp_hours_draft") return <XaSystemTile kind="listing" size={size} />;
  if (event.source === "ai") return <XaPebbleAvatar size={size} />;
  return <XaSystemTile kind={SOURCE_CLAY[event.source] ?? "website"} size={size} />;
}

export function formatEventStatus(event: UnifiedEvent): string {
  if (event.status === "approved") {
    // Structural changes are handed to the builder, not auto-published.
    return event.type === "content_update" && event.metadata?.kind === "manual_structural_change"
      ? "Sent to your builder"
      : "Made live";
  }
  if (event.status === "auto_approved") return "Handled";
  if (event.status === "dismissed") return "Not yet";
  return "Waits for you";
}

export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  if (!Number.isFinite(diffMs)) return "";
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr} h ago`;
  if (diffDays < 7) return date.toLocaleDateString("en-US", { weekday: "short" });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Who acted, then when: "Strelva prepared it · 2 h ago". */
function whoAndWhen(event: UnifiedEvent, isCustomRequest: boolean): string {
  const when = formatTimestamp(event.createdAt);
  const who = isCustomRequest ? "You asked"
    : event.type === "suggestion" ? "Strelva suggested it"
      : event.source === "ai" ? "Strelva prepared it"
        : `From ${formatEventSource(event.source)}`;
  return when ? `${who} · ${when}` : who;
}

function metadataString(event: UnifiedEvent, key: string): string | null {
  const value = event.metadata?.[key];
  return typeof value === "string" ? value : null;
}

function formatWorkflowStatus(status: string | null): string {
  if (status === "in_progress") return "In progress";
  if (status === "shipped") return "Shipped";
  if (status === "declined") return "Declined";
  if (status === "quoted") return "Quoted";
  if (status === "accepted") return "Accepted";
  if (status === "triaged") return "Triaged";
  return "Requested";
}

// Client-facing status for a custom change request: never the operator stage or the repo.
function formatClientRequestStatus(status: string | null): string {
  if (status === "shipped") return "Done";
  if (status === "declined") return "Declined";
  if (status === "in_progress") return "In progress";
  if (status === "requested" || status === null) return "Received";
  return "In progress";
}

/* ---------- What the yes changes, as the page people will see ---------- */

const MAX_DIFF_ROWS = 6;
const DAY_LABELS: Record<string, string> = { MONDAY: "Monday", TUESDAY: "Tuesday", WEDNESDAY: "Wednesday", THURSDAY: "Thursday", FRIDAY: "Friday", SATURDAY: "Saturday", SUNDAY: "Sunday" };
const PAGE_NAMES: Record<string, string> = { hero: "homepage", services: "Services page", faq: "FAQ", contact: "Contact page", about: "About page", testimonials: "reviews section" };

function clock(value: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return value;
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

function readDiffs(event: UnifiedEvent): PreviewDiff[] {
  if (event.type !== "content_update" || !Array.isArray(event.metadata?.diffs)) return [];
  return (event.metadata.diffs as unknown[]).filter((d): d is PreviewDiff => Boolean(d) && typeof d === "object" && typeof (d as PreviewDiff).field === "string" && ["added", "removed", "changed"].includes((d as PreviewDiff).type));
}

/** The address a change lands on, in owner words: "harbordental.com" for the homepage. */
function pageAddress(event: UnifiedEvent, domain: string | null): string {
  const section = typeof event.metadata?.section === "string" ? event.metadata.section : "hero";
  const name = PAGE_NAMES[section] ?? "website";
  if (!domain) return `Your ${name}`;
  return section === "hero" ? domain : `${domain}/${section}`;
}

/**
 * The change itself. A site edit is the page with the new words tinted moss
 * and the words they replace under them; a Google post or hours draft is the
 * listing the way people see it on Google. Nothing here is a label to trust:
 * it is the thing the yes puts live.
 */
export function QueueChange({ event, domain }: { event: UnifiedEvent; domain: string | null }) {
  const meta = event.metadata ?? {};
  if (event.type === "content_update" && meta.kind === "gbp_post_draft" && typeof meta.summary === "string" && meta.summary.trim()) {
    const cta = typeof meta.ctaUrl === "string" && meta.ctaUrl.trim() ? meta.ctaUrl.trim() : null;
    return <div className={styles.change}>
      <XaLabel>What will be posted to Google</XaLabel>
      <XaPage address="Your Google listing · new post" flat>
        <XaPageChange>{meta.summary.trim()}</XaPageChange>
        {cta ? <p className={styles.pageNote}>Button link {cta}</p> : null}
      </XaPage>
    </div>;
  }
  if (event.type === "content_update" && meta.kind === "gbp_hours_draft" && Array.isArray(meta.hours)) {
    const hours = (meta.hours as { day?: unknown; open?: unknown; close?: unknown }[]).filter((h) => typeof h?.day === "string" && typeof h.open === "string" && typeof h.close === "string") as { day: string; open: string; close: string }[];
    if (hours.length) return <div className={styles.change}>
      <XaLabel>New hours for Google</XaLabel>
      <XaPage address="Your Google listing · hours" flat>
        <dl className={styles.hours}>{hours.map((h, i) => <div key={`${h.day}-${i}`}><dt>{DAY_LABELS[h.day] ?? h.day}</dt><dd>{clock(h.open)} to {clock(h.close)}</dd></div>)}</dl>
      </XaPage>
    </div>;
  }
  const diffs = readDiffs(event);
  if (!diffs.length) return null;
  const shown = diffs.slice(0, MAX_DIFF_ROWS);
  const extra = diffs.length - shown.length;
  return <div className={styles.change}>
    <XaLabel>The change</XaLabel>
    <XaPage address={pageAddress(event, domain)} flat>
      {shown.map((d, i) => <div key={`${d.field}-${i}`} className={styles.diff}>
        <span className={styles.diffField}>{d.field}</span>
        {d.type === "removed"
          ? <p className={`${styles.diffGone} line-through`}><span className="sr-only">Removed: </span>{d.before}</p>
          : <XaPageChange>{d.after}</XaPageChange>}
        {d.type === "changed" && d.before ? <p className={styles.pageNote}><span className="sr-only">Was: </span>Replaces <span className="line-through">{d.before}</span></p> : null}
      </div>)}
      {extra > 0 ? <p className={styles.pageNote}>+{extra} more field{extra === 1 ? "" : "s"} changed</p> : null}
    </XaPage>
  </div>;
}

type WorkflowAction = "triaged" | "quoted" | "accepted" | "in_progress" | "shipped" | "declined";

interface QueueCardProps {
  event: UnifiedEvent;
  onApprove: (id: string) => void;
  onDismiss: (id: string) => void;
  onWorkflowAction?: (id: string, action: WorkflowAction) => void;
  disabled?: boolean;
  /** Operator (super-admin) view: the custom-request fulfillment controls, repo and triage date. */
  isOperator?: boolean;
  /** The row is open as the decision. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function QueueCard({ event, onApprove, onDismiss, onWorkflowAction, disabled, isOperator = false, open = false, onOpenChange }: QueueCardProps) {
  const isPending = event.status === "pending";
  const isCustomRequest = event.type === "change_request" && event.metadata?.kind === "custom_code_or_design_request";
  const isSuggestion = event.type === "suggestion";
  const workflowStatus = isCustomRequest ? metadataString(event, "workflowStatus") || "requested" : null;
  const repo = isCustomRequest && event.metadata?.customRepo && typeof event.metadata.customRepo === "object"
    ? event.metadata.customRepo as Record<string, unknown>
    : null;
  const repoName = typeof repo?.repoName === "string" ? repo.repoName : null;
  const triageDueAt = isCustomRequest ? metadataString(event, "triageDueAt") : null;
  const [testimonialModalOpen, setTestimonialModalOpen] = useState(false);
  const dashboard = useDashboardOptional();
  const domain = dashboard?.siteUrl ? dashboard.siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "") || null : null;

  const isReview = event.source === "google" || event.source === "yelp";
  const reviewData = isReview && event.metadata
    ? {
        id: event.id,
        author: (event.metadata as Record<string, unknown>).author as string || "Customer",
        text: event.body || "",
        source: event.source,
        rating: (event.metadata as Record<string, unknown>).rating as number || 5,
      }
    : null;

  const status = !isPending
    ? <XaStatus kind={event.status === "dismissed" ? "draft" : "live"} size="sm">{formatEventStatus(event)}</XaStatus>
    : isCustomRequest
      ? <span className={styles.word}>{isOperator ? formatWorkflowStatus(workflowStatus) : formatClientRequestStatus(workflowStatus)}</span>
      // Every open row waits; the word would repeat on each one. Only "working" is an exception.
      : disabled ? <XaStatus kind="working" size="sm">Working</XaStatus> : null;

  const canDecide = isPending && !isCustomRequest;
  const rowBody = <>
    {queueLead(event)}
    <span className={styles.text}>
      <span className={styles.title}>{event.title}</span>
      <span className={styles.detail}>{whoAndWhen(event, isCustomRequest)}</span>
    </span>
    <span className={styles.end}>{status}</span>
  </>;

  return (
    <div className={styles.item} data-open={open || undefined} data-busy={disabled || undefined}>
      {canDecide && onOpenChange ? (
        <button type="button" className={styles.row} aria-expanded={open} onClick={() => onOpenChange(!open)}>{rowBody}</button>
      ) : (
        <div className={styles.row}>{rowBody}</div>
      )}

      {open && canDecide ? (
        <div className={styles.decision}>
          {event.body ? <p className={styles.body}>{event.body}</p> : null}
          <QueueChange event={event} domain={domain} />
          <XaYes
            state={disabled ? "going" : "waiting"}
            yesLabel={isSuggestion ? "Use this idea" : "Make it live"}
            onYes={() => onApprove(event.id)}
            onNotYet={() => onDismiss(event.id)}
            notYetAriaLabel={`Not yet: ${event.title}. Nothing on your site changes.`}
            block={false}
          />
          {isReview && reviewData ? <p className={styles.links}><XaTextLink onClick={() => setTestimonialModalOpen(true)}>Put this review on your site</XaTextLink></p> : null}
        </div>
      ) : null}

      {isCustomRequest ? (
        <div className={styles.request}>
          {event.body ? <p className={styles.body}>{event.body}</p> : null}
          {isOperator && (repoName || (triageDueAt && workflowStatus === "requested")) ? (
            <p className={styles.meta}>
              {repoName ? `Repo ${repoName}` : null}
              {repoName && triageDueAt && workflowStatus === "requested" ? " · " : null}
              {triageDueAt && workflowStatus === "requested" ? `Triage by ${new Date(triageDueAt).toLocaleDateString()}` : null}
            </p>
          ) : null}
          {isPending && !disabled && isOperator && onWorkflowAction ? (
            <div className={styles.operator} aria-label="Strelva fulfillment">
              {workflowStatus === "requested" ? <XaButton size="sm" onClick={() => onWorkflowAction(event.id, "triaged")}>Triaged</XaButton> : null}
              {workflowStatus === "triaged" || workflowStatus === "quoted" || workflowStatus === "accepted" ? <XaButton size="sm" onClick={() => onWorkflowAction(event.id, "in_progress")}>Start</XaButton> : null}
              <XaButton size="sm" onClick={() => onWorkflowAction(event.id, "shipped")}>Shipped</XaButton>
              <XaButton size="sm" variant="quiet" onClick={() => onWorkflowAction(event.id, "declined")}>Decline</XaButton>
            </div>
          ) : null}
        </div>
      ) : null}

      {reviewData && (
        <UseAsTestimonialModal
          open={testimonialModalOpen}
          onClose={() => setTestimonialModalOpen(false)}
          review={reviewData}
          onSuccess={() => onApprove(event.id)}
        />
      )}
    </div>
  );
}
