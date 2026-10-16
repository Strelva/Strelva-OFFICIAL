"use client";

import { useState } from "react";
import type { UnifiedEvent } from "@/lib/types";
import { XaButton, XaPebbleAvatar, XaStatus, XaSystemTile, XaTextLink, XaYes } from "@/components/ui/strelva/Xa";
import { UseAsTestimonialModal } from "./UseAsTestimonialModal";
import { QueueEventDetail } from "./QueueEventDetail";
import styles from "./queue.module.css";

/**
 * One thing that waits, as an open row (XA · O5). Opened, it becomes the
 * decision in place: what changes, then the one yes (XA · O3). The yes is the
 * product's only approval gesture; "Not yet" closes it and keeps it waiting,
 * "Skip this change" turns it down.
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
  if (event.status === "dismissed") return "Skipped";
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
          <QueueEventDetail event={event} className={styles.change} />
          <XaYes
            state={disabled ? "going" : "waiting"}
            yesLabel={isSuggestion ? "Use this idea" : "Make it live"}
            onYes={() => onApprove(event.id)}
            onNotYet={onOpenChange ? () => onOpenChange(false) : undefined}
            block={false}
          />
          <p className={styles.links}>
            <XaTextLink onClick={() => onDismiss(event.id)}>Skip this change</XaTextLink>
            {isReview && reviewData ? <> · <XaTextLink onClick={() => setTestimonialModalOpen(true)}>Use the review on your site</XaTextLink></> : null}
          </p>
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
