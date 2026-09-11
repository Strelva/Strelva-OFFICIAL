"use client";

import { AlertCircle, CheckCircle2, Clock3, Mail, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import type {
  InquiryMessageReviewAction,
  InquiryMessageReviewOutcome,
  InquiryMessageReviewPreview,
  InquiryMessageReviewRequest,
} from "./message-review-contract";
import styles from "./message-review.module.css";

export type {
  ApproveInquiryMessageReviewRequest,
  InquiryMessageReviewAction,
  InquiryMessageReviewApprovedResponse,
  InquiryMessageReviewOutcome,
  InquiryMessageReviewOutcomeStatus,
  InquiryMessageReviewPreparedResponse,
  InquiryMessageReviewPreview,
  InquiryMessageReviewRequest,
  InquiryMessageReviewResponse,
  PrepareInquiryMessageReviewRequest,
} from "./message-review-contract";

const DEFAULT_ENDPOINT = "/api/inquiry-workspace/message-review";
const COMPLETION_STATUSES = new Set<InquiryMessageReviewOutcome["status"]>([
  "accepted",
  "verified",
  "delivered",
  "accepted_unverified",
  "reconciliation_required",
  "sending",
]);
const OUTCOME_STATUSES = new Set<InquiryMessageReviewOutcome["status"]>([
  "ready",
  "awaiting_approval",
  "not_due",
  "paused",
  "budget_exhausted",
  "disabled",
  "sending",
  "accepted",
  "verified",
  "delivered",
  "accepted_unverified",
  "reconciliation_required",
  "failed",
  "suppressed",
  "bounced",
  "deferred",
  "unavailable",
  "retry_exhausted",
  "blocked",
]);

export type MessageReviewRequest = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface InquiryMessageReviewProps {
  tenantId: string;
  inquiryId: string;
  action?: InquiryMessageReviewAction;
  /**
   * A stable business identifier is useful to the host for display, but the
   * server derives the real business scope from tenant membership. It is never
   * sent as a recipient or message field.
   */
  businessId?: string;
  endpoint?: string;
  request?: MessageReviewRequest;
  autoPrepare?: boolean;
  /** Optional server-hydrated review for hosts that already prepared it. */
  initialReview?: InquiryMessageReviewPreview;
  onPrepared?: (review: InquiryMessageReviewPreview) => void;
  onCompleted?: (outcome: InquiryMessageReviewOutcome) => void;
}

type ReviewState =
  | { status: "idle" }
  | { status: "preparing" }
  | { status: "ready"; review: InquiryMessageReviewPreview }
  | { status: "approving"; review: InquiryMessageReviewPreview }
  | { status: "completed"; review: InquiryMessageReviewPreview; outcome: InquiryMessageReviewOutcome }
  | { status: "error"; message: string; review?: InquiryMessageReviewPreview };

function defaultRequest(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, init);
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 ? value : null;
}

function isAction(value: unknown): value is InquiryMessageReviewAction {
  return value === "reply" || value === "owner_notification" || value === "schedule_follow_up";
}

function readPreview(value: unknown): InquiryMessageReviewPreview | null {
  const root = objectValue(value);
  const row = objectValue(root?.review ?? root?.preview);
  if (!row) return null;
  const action = row.action;
  const capabilityVersion = row.capabilityVersion === null || row.capabilityVersion === undefined
    ? null
    : positiveInteger(row.capabilityVersion);
  const reviewToken = text(row.reviewToken ?? row.token);
  const inquiryId = text(row.inquiryId);
  const recipient = text(row.recipient ?? row.to);
  const subject = text(row.subject);
  const body = text(row.body ?? row.text);
  const messageDigest = text(row.messageDigest ?? row.digest);
  const policyVersion = text(row.policyVersion);
  const preparedAt = text(row.preparedAt ?? row.createdAt);
  if (!reviewToken || !inquiryId || !isAction(action) || !recipient || !subject || !body || !messageDigest || !/^[a-f0-9]{32,128}$/i.test(messageDigest) || !policyVersion || !preparedAt) return null;
  if (row.capabilityVersion !== null && row.capabilityVersion !== undefined && capabilityVersion === null) return null;
  return {
    reviewToken,
    inquiryId,
    action,
    recipient,
    subject,
    body,
    messageDigest,
    policyVersion,
    capabilityId: nullableText(row.capabilityId),
    capabilityVersion,
    preparedAt,
    expiresAt: nullableText(row.expiresAt),
  };
}

function readOutcome(value: unknown): InquiryMessageReviewOutcome | null {
  const root = objectValue(value);
  const row = objectValue(root?.outcome ?? root?.result);
  if (!row) return null;
  const inquiryId = text(row.inquiryId);
  const action = row.action;
  const status = row.status;
  if (!inquiryId || !isAction(action) || typeof status !== "string") return null;
  if (!OUTCOME_STATUSES.has(status as InquiryMessageReviewOutcome["status"]) || typeof row.retryable !== "boolean") return null;
  const providerAccepted = ["accepted", "verified", "delivered", "accepted_unverified", "reconciliation_required"].includes(status);
  return {
    inquiryId,
    action,
    status: status as InquiryMessageReviewOutcome["status"],
    ...(typeof row.reason === "string" && row.reason.trim() ? { reason: row.reason } : {}),
    ...(typeof row.acceptedAt === "string" ? { acceptedAt: row.acceptedAt } : {}),
    ...(typeof row.providerMessageId === "string" ? { providerMessageId: row.providerMessageId } : {}),
    ...(Array.isArray(row.verificationEvidence) ? {
      verificationEvidence: row.verificationEvidence.filter((item): item is string => typeof item === "string"),
    } : {}),
    retryable: providerAccepted ? false : row.retryable,
  };
}

function apiError(value: unknown): string | null {
  const row = objectValue(value);
  const error = row?.error;
  return typeof error === "string" && error.trim() ? error : null;
}

function actionLabel(action: InquiryMessageReviewAction): string {
  if (action === "owner_notification") return "team notification";
  if (action === "schedule_follow_up") return "follow-up";
  return "reply";
}

function outcomeClosesRetry(status: InquiryMessageReviewOutcome["status"]): boolean {
  return COMPLETION_STATUSES.has(status);
}

export function messageReviewCompletionCopy(outcome: InquiryMessageReviewOutcome): { title: string; detail: string; tone: "success" | "warning" | "error" } {
  if (outcome.status === "accepted_unverified") {
    return {
      title: "The provider accepted this message, but verification needs attention.",
      detail: "Do not retry this send. Check the delivery evidence before taking another action.",
      tone: "warning",
    };
  }
  if (outcome.status === "reconciliation_required") {
    return {
      title: outcome.acceptedAt || outcome.providerMessageId ? "The message was accepted, but its receipt needs checking." : "We could not confirm what happened to this message.",
      detail: "Do not send it again. Check the delivery history before taking another action.",
      tone: "warning",
    };
  }
  if (outcome.status === "accepted") {
    return {
      title: "The provider accepted this message.",
      detail: "Verification is still pending. This review cannot be sent again.",
      tone: "success",
    };
  }
  if (outcome.status === "verified") {
    return {
      title: "The provider accepted and verified this message.",
      detail: "The verified delivery receipt is attached to this inquiry.",
      tone: "success",
    };
  }
  if (outcome.status === "delivered") {
    return {
      title: "The provider reported delivery.",
      detail: "The delivery receipt is attached to this inquiry.",
      tone: "success",
    };
  }
  if (outcome.status === "bounced") {
    return {
      title: "The provider reported a bounce.",
      detail: outcome.reason || "The message did not reach the recipient. Resolve the recipient issue before preparing another review.",
      tone: "error",
    };
  }
  if (outcome.status === "deferred") {
    return {
      title: "The provider deferred delivery.",
      detail: outcome.reason || "Delivery is not confirmed. Resolve the provider issue before preparing another review.",
      tone: "warning",
    };
  }
  if (outcome.status === "suppressed") {
    return {
      title: "The provider suppressed this message.",
      detail: outcome.reason || "The provider did not deliver this message. Resolve the suppression before preparing another review.",
      tone: "error",
    };
  }
  if (outcome.status === "blocked") {
    return {
      title: "The message was blocked before provider send.",
      detail: outcome.reason || "Resolve the responsibility or recipient issue before preparing another review.",
      tone: "error",
    };
  }
  if (outcome.status === "sending") {
    return {
      title: "The message is still being reconciled.",
      detail: "Do not retry this send. Wait for the delivery evidence to settle before taking another action.",
      tone: "warning",
    };
  }
  if (outcome.status === "retry_exhausted") {
    return {
      title: "Message delivery reached its retry limit.",
      detail: outcome.reason || "Resolve the delivery issue before preparing another review.",
      tone: "error",
    };
  }
  if (outcome.status === "unavailable") {
    return {
      title: "The delivery outcome is unavailable.",
      detail: outcome.reason || "Refresh the inquiry and check its recorded delivery evidence before taking another action.",
      tone: "warning",
    };
  }
  return {
    title: outcome.status === "failed" ? "Message delivery failed." : "The message remains awaiting approval.",
    detail: outcome.reason || "Resolve the issue before preparing another review.",
    tone: "error",
  };
}

function preparedLabel(value: string): string {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(parsed) : "Date not recorded";
}

function expiryLabel(value: string | null): string {
  if (!value) return "No expiry recorded";
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(parsed) : "Expiry not recorded";
}

export function InquiryMessageReview({
  tenantId,
  inquiryId,
  action = "reply",
  businessId,
  endpoint = DEFAULT_ENDPOINT,
  request = defaultRequest,
  autoPrepare = false,
  initialReview,
  onPrepared,
  onCompleted,
}: InquiryMessageReviewProps) {
  const headingId = useId();
  const sendHelpId = `${headingId}-send-help`;
  const requestSequence = useRef(0);
  const scopedInitialReview = initialReview && initialReview.inquiryId === inquiryId && initialReview.action === action
    ? initialReview
    : undefined;
  const initialReviewMismatch = Boolean(initialReview && !scopedInitialReview);
  const [state, setState] = useState<ReviewState>(() => scopedInitialReview ? { status: "ready", review: scopedInitialReview } : { status: "idle" });
  const [requestError, setRequestError] = useState(() => initialReviewMismatch ? "This prepared message belongs to another inquiry. Review the current message before sending." : "");

  const prepare = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setRequestError("");
    setState({ status: "preparing" });
    const body: InquiryMessageReviewRequest = { operation: "prepare", tenantId, inquiryId, action };
    try {
      const response = await request(endpoint, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiError(payload) || "The message could not be prepared.");
      const review = readPreview(payload);
      if (!review) throw new Error("The server returned an incomplete message review. Refresh before trying again.");
      if (review.inquiryId !== inquiryId || review.action !== action) throw new Error("The message review scope changed. Refresh before trying again.");
      if (sequence !== requestSequence.current) return;
      setState({ status: "ready", review });
      onPrepared?.(review);
    } catch (cause) {
      if (sequence !== requestSequence.current) return;
      const message = cause instanceof Error ? cause.message : "The message could not be prepared.";
      setRequestError(message);
      setState({ status: "error", message });
    }
  }, [action, endpoint, inquiryId, onPrepared, request, tenantId]);

  useEffect(() => {
    requestSequence.current += 1;
    setRequestError(initialReviewMismatch ? "This prepared message belongs to another inquiry. Review the current message before sending." : "");
    setState(scopedInitialReview ? { status: "ready", review: scopedInitialReview } : { status: "idle" });
  }, [action, initialReviewMismatch, inquiryId, scopedInitialReview, tenantId]);

  useEffect(() => {
    if (!autoPrepare || scopedInitialReview || initialReviewMismatch) return;
    void prepare();
  }, [autoPrepare, initialReviewMismatch, prepare, scopedInitialReview]);

  const review = state.status === "ready" || state.status === "approving" || state.status === "completed" || state.status === "error"
    ? state.review
    : undefined;
  const completed = state.status === "completed" ? messageReviewCompletionCopy(state.outcome) : null;
  const canSend = Boolean(review) && state.status === "ready";
  const busy = state.status === "preparing" || state.status === "approving";
  const context = useMemo(() => businessId ? `Business ${businessId}` : "Authorized inquiry scope", [businessId]);

  async function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!review || !canSend) return;
    const sequence = ++requestSequence.current;
    setRequestError("");
    setState({ status: "approving", review });
    const body: InquiryMessageReviewRequest = {
      operation: "approve",
      tenantId,
      inquiryId,
      action,
      reviewToken: review.reviewToken,
      messageDigest: review.messageDigest,
    };
    try {
      const response = await request(endpoint, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        if (sequence !== requestSequence.current) return;
        const message = apiError(payload) || "The review could not be approved. Refresh before trying again.";
        setState({ status: "error", message, review });
        setRequestError(message);
        return;
      }
      const outcome = readOutcome(payload);
      if (!outcome) {
        if (sequence !== requestSequence.current) return;
        const message = "The send outcome could not be confirmed. Refresh before trying again.";
        setState({ status: "error", message, review });
        setRequestError(message);
        return;
      }
      if (sequence !== requestSequence.current) return;
      setState({ status: "completed", review, outcome });
      onCompleted?.(outcome);
    } catch (cause) {
      if (sequence !== requestSequence.current) return;
      const message = cause instanceof Error ? cause.message : "The review could not be approved. Refresh before trying again.";
      setState({ status: "error", message, review });
      setRequestError(message);
    }
  }

  return <section className={styles.panel} aria-labelledby={headingId} aria-busy={busy} data-message-review data-tenant-id={tenantId} data-inquiry-id={inquiryId}>
    <div className={styles.header}>
      <div>
        <span className={styles.eyebrow}>MESSAGE REVIEW</span>
        <h2 id={headingId} className="font-display">Review before sending</h2>
        <p>Strelva prepares the exact message first. Sending requires your explicit approval for this inquiry.</p>
      </div>
      <span className={styles.scope}><ShieldCheck size={15} aria-hidden="true" />{context}</span>
    </div>

    {state.status === "preparing" ? <div className={styles.status} role="status"><Clock3 size={17} aria-hidden="true" /><div className={styles.statusContent}><p>Preparing the current message…</p></div></div> : null}
    {state.status === "idle" && !autoPrepare ? <div className={styles.status}><Mail size={17} aria-hidden="true" /><div className={styles.statusContent}><p>{initialReviewMismatch ? requestError : `Review the current ${actionLabel(action)} to inspect its recipient and text.`}</p><button type="button" className={styles.secondaryButton} onClick={() => void prepare()} disabled={busy} data-review-prepare>Review current message</button></div></div> : null}
    {state.status === "error" && !review ? <div className={styles.statusError} role="alert"><AlertCircle size={17} aria-hidden="true" /><div className={styles.statusContent}><p>{state.message}</p><button type="button" className={styles.secondaryButton} onClick={() => void prepare()} disabled={busy} data-review-prepare>Try again</button></div></div> : null}

    {review ? <div className={styles.reviewBody}>
      <dl className={styles.facts}>
        <div><dt>Recipient</dt><dd data-review-recipient>{review.recipient}</dd></div>
        <div><dt>Subject</dt><dd data-review-subject>{review.subject}</dd></div>
        <div><dt>Prepared</dt><dd>{preparedLabel(review.preparedAt)}</dd></div>
        <div><dt>Expires</dt><dd>{expiryLabel(review.expiresAt)}</dd></div>
        <div><dt>Policy</dt><dd>{review.policyVersion}</dd></div>
      </dl>
      <div className={styles.message}>
        <span className={styles.messageLabel}>Exact message</span>
        <pre data-review-body>{review.body}</pre>
      </div>

      {completed ? <div className={completed.tone === "success" ? styles.success : completed.tone === "warning" ? styles.warning : styles.statusError} role={completed.tone === "error" ? "alert" : "status"}>
        {completed.tone === "success" ? <CheckCircle2 size={17} aria-hidden="true" /> : <AlertCircle size={17} aria-hidden="true" />}
        <div><strong>{completed.title}</strong><p>{completed.detail}</p></div>
      </div> : null}
      {state.status === "error" && review ? <div className={styles.statusError} role="alert"><AlertCircle size={17} aria-hidden="true" /><p>{requestError || "The message review could not be completed."}</p></div> : null}
      {!completed ? <form onSubmit={(event) => void approve(event)} className={styles.actions}>
        <button type="submit" className={styles.primaryButton} disabled={!canSend || busy} aria-describedby={sendHelpId} data-review-send>{busy ? "Checking approval…" : "Send this message"}</button>
        <button type="button" className={styles.secondaryButton} onClick={() => void prepare()} disabled={busy}>Prepare again</button>
        <p id={sendHelpId}>Only the reviewed recipient, subject, and body can be approved. A changed or revoked review is rejected by the server.</p>
      </form> : completed && state.status === "completed" && !outcomeClosesRetry(state.outcome.status) ? <div className={styles.actions}>
        <button type="button" className={styles.secondaryButton} onClick={() => void prepare()} disabled={busy}>Prepare a new review</button>
        <p>The failed attempt was recorded. Resolve the issue before preparing another message.</p>
      </div> : null}
    </div> : null}
  </section>;
}
