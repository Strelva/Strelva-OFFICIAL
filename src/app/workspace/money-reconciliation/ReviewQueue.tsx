"use client";
import {
  XaButton,
  XaField,
  XaSelect,
  XaTextArea,
} from "@/components/ui/strelva/Xa";
import xa from "@/experience/workspace/money/money.module.css";
import { useEffect, useRef, useState } from "react";
export interface ReconciliationIssue {
  account_id: string;
  event_id: string;
  reason: string;
  event_type: string;
  object_id: string | null;
  /** When Stripe's event reached Strelva (the issue row's created_at). */
  created_at?: string;
  /** Present only when the read carries it; never inferred. */
  amount_cents?: number | null;
  currency?: string | null;
  resolution: {
    id: string;
    kind: string;
    note: string;
    /** Who recorded it and when; the read returns the whole resolution row. */
    reviewed_by?: string;
    created_at?: string;
  } | null;
}
const KIND_WORDS: Record<string, string> = {
  no_effect_after_review: "found nothing moved",
  effect_confirmed: "found it already in Strelva's records",
};
const REASON_WORDS: Record<string, string> = {
  unmatched_payment: "A payment Strelva has no record of",
  late_refund: "A refund that arrived late",
};
const EVENT_WORDS: Record<string, string> = {
  "payment_intent.succeeded": "a payment succeeded",
  "charge.succeeded": "a payment succeeded",
  "charge.refunded": "a refund went through",
  "charge.dispute.created": "a customer disputed a payment",
  "invoice.paid": "an invoice was paid",
};
const REASON_AFTER: Record<string, string> = {
  unmatched_payment: "Strelva has no record of it.",
  late_refund: "It arrived after Strelva had closed that payment.",
};
const amountWords = (cents: number | null | undefined, currency: string | null | undefined) =>
  typeof cents === "number" && Number.isFinite(cents)
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: (currency || "usd").toUpperCase() }).format(cents / 100)
    : "";
/** One plain sentence per item: whose Stripe, what it says happened, when, and why it needs a look. */
function issueSentence(issue: ReconciliationIssue, account: string) {
  const what = EVENT_WORDS[issue.event_type] ?? "something changed on a payment";
  const amount = amountWords(issue.amount_cents, issue.currency);
  const on = day(issue.created_at);
  const said = amount ? what.replace(/^a (payment|refund)/, `a ${amount} $1`) : what;
  return `${account}’s Stripe says ${said}${on ? ` on ${on}` : ""}. ${REASON_AFTER[issue.reason] ?? "It doesn’t match Strelva’s records."}`;
}
const reasonWords = (reason: string) =>
  REASON_WORDS[reason] ??
  `${reason.charAt(0).toUpperCase()}${reason.slice(1).replaceAll("_", " ")}`;
const day = (iso: string | undefined) => {
  const value = iso ? new Date(iso) : null;
  return value && Number.isFinite(value.getTime())
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
      }).format(value)
    : "";
};
/**
 * Operator console (Strelva staff only): Stripe payments that didn't match
 * Strelva's records. Each item is a sentence; the Stripe ids staff need to
 * find it sit behind "Stripe details".
 */
export default function ReviewQueue({
  issues,
  actorId,
  names = {},
  accountNames = {},
}: {
  issues: ReconciliationIssue[];
  /** The signed-in staff member, so their own reviews read "You". */
  actorId?: string;
  /** Staff display names by user id, when known. */
  names?: Readonly<Record<string, string>>;
  /** Who owns each connected Stripe account, by account id, when known. */
  accountNames?: Readonly<Record<string, string>>;
}) {
  const who = (id: string | undefined) =>
    id && names[id]
      ? names[id]!
      : id && id === actorId
        ? "You"
        : "Another Strelva staff member";
  const [rows, setRows] = useState(issues);
  return (
    <div className={xa.section}>
      {rows.length ? (
        rows.map((i) => (
          <Review
            key={`${i.account_id}:${i.event_id}:${i.reason}`}
            issue={i}
            who={who}
            account={
              accountNames[i.account_id] ??
              (i.account_id === "platform" ? "Strelva" : "A connected account")
            }
            onResolved={(r) =>
              setRows((old) =>
                old.map((v) => (v === i ? { ...v, resolution: r } : v)),
              )
            }
          />
        ))
      ) : (
        <div className={xa.block}>
          <p>Nothing waits on staff until Stripe sends something new.</p>
        </div>
      )}
    </div>
  );
}
function Review({
  issue,
  onResolved,
  who,
  account,
}: {
  issue: ReconciliationIssue;
  who: (id: string | undefined) => string;
  account: string;
  onResolved: (receipt: NonNullable<ReconciliationIssue["resolution"]>) => void;
}) {
  const [kind, setKind] = useState("no_effect_after_review");
  const [note, setNote] = useState("");
  const [evidenceKind, setEvidenceKind] = useState("invoice_split");
  const [evidenceId, setEvidenceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    note?: string;
    evidenceId?: string;
  }>({});
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function resolve(e: React.FormEvent) {
    e.preventDefault();
    const problems = {
      note:
        note.trim().length >= 20
          ? undefined
          : "Write what you checked, in a sentence or two (at least 20 letters).",
      evidenceId:
        kind !== "effect_confirmed" || evidenceId.trim()
          ? undefined
          : "Paste the record's id from Strelva's records.",
    };
    setFieldErrors(problems);
    if (problems.note || problems.evidenceId) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/workspace/money-reconciliation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: issue.account_id,
          eventId: issue.event_id,
          reason: issue.reason,
          kind,
          note,
          ...(kind === "effect_confirmed" ? { evidenceKind, evidenceId } : {}),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (
        !response.ok ||
        typeof result.id !== "string" ||
        !result.id.match(/^[a-f0-9-]{36}$/)
      )
        throw Error(
          result.error ??
            "Strelva couldn't confirm your note was saved. Sign in and try again.",
        );
      if (active.current) onResolved(result);
    } catch (e) {
      if (active.current)
        setError(
          e instanceof Error ? e.message : "Your note wasn't saved. Nothing changed.",
        );
    } finally {
      if (active.current) setBusy(false);
    }
  }
  return (
    <div className={xa.block}>
      <h2 className={xa.heading}>
        {reasonWords(issue.reason)}
      </h2>
      <p className={xa.body}>{issueSentence(issue, account)}</p>
      <details className={xa.history}>
        <summary className={xa.detailsToggle}>Stripe details</summary>
        <dl className={xa.docLines}>
          <div className={xa.docLine}>
            <dt>Account</dt>
            <dd>{issue.account_id}</dd>
          </div>
          <div className={xa.docLine}>
            <dt>Event</dt>
            <dd>
              {issue.event_type}, {issue.event_id}
            </dd>
          </div>
          <div className={xa.docLine}>
            <dt>Payment</dt>
            <dd>{issue.object_id ?? "Stripe didn’t say which payment"}</dd>
          </div>
        </dl>
      </details>
      {issue.resolution ? (
        <div className={xa.body}>
          <p role="status">
            {who(issue.resolution.reviewed_by)}{" "}
            {KIND_WORDS[issue.resolution.kind] ??
              `recorded ${issue.resolution.kind.replaceAll("_", " ")}`}
            {day(issue.resolution.created_at)
              ? ` on ${day(issue.resolution.created_at)}`
              : ""}
            .
          </p>
          <p className={xa.note}>{issue.resolution.note}</p>
        </div>
      ) : (
        <form onSubmit={resolve} className={xa.form} noValidate>
          <XaSelect
            label="What you found"
            options={[
              {
                value: "no_effect_after_review",
                label: "Nothing moved; no money changed hands",
              },
              {
                value: "effect_confirmed",
                label: "It's already in Strelva's records",
              },
            ]}
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            disabled={busy}
          />
          <XaTextArea
            label="What you checked and why"
            maxLength={5000}
            value={note}
            error={fieldErrors.note}
            onChange={(e) => {
              setNote(e.target.value);
              setFieldErrors((current) => ({ ...current, note: undefined }));
            }}
            disabled={busy}
          />
          {kind === "effect_confirmed" ? (
            <>
              <XaSelect
                label="Which of Strelva's records shows it"
                options={[
                  { value: "invoice_split", label: "Invoice source receipt" },
                  {
                    value: "business_payment",
                    label: "Customer payment event",
                  },
                  {
                    value: "platform_settlement",
                    label: "Platform settlement",
                  },
                ]}
                value={evidenceKind}
                onChange={(e) => setEvidenceKind(e.target.value)}
                disabled={busy}
              />
              <XaField
                label="That record's id"
                value={evidenceId}
                error={fieldErrors.evidenceId}
                onChange={(e) => {
                  setEvidenceId(e.target.value);
                  setFieldErrors((current) => ({
                    ...current,
                    evidenceId: undefined,
                  }));
                }}
                disabled={busy}
              />
            </>
          ) : null}
          <p className={xa.note}>
            Your note is kept with your name. It never charges, refunds, moves
            or retries a payment.
          </p>
          <XaButton type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save what you found"}
          </XaButton>
          {error ? (
            <p role="alert" className={xa.critical}>
              {error}
            </p>
          ) : null}
        </form>
      )}
    </div>
  );
}
