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
  no_effect_after_review: "recorded no effect",
  effect_confirmed: "confirmed the ledger effect",
};
const day = (iso: string | undefined) => {
  const value = iso ? new Date(iso) : null;
  return value && Number.isFinite(value.getTime())
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
      }).format(value)
    : "";
};
/** Library (Strelva staff): Stripe records that did not match the ledger. Ids are shown; staff need them to find the record. */
export default function ReviewQueue({
  issues,
  actorId,
  names = {},
}: {
  issues: ReconciliationIssue[];
  /** The signed-in staff member, so their own reviews read "You". */
  actorId?: string;
  /** Staff display names by user id, when known. */
  names?: Readonly<Record<string, string>>;
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
            onResolved={(r) =>
              setRows((old) =>
                old.map((v) => (v === i ? { ...v, resolution: r } : v)),
              )
            }
          />
        ))
      ) : (
        <div className={xa.block}>
          <p>No payment exceptions are awaiting review.</p>
        </div>
      )}
    </div>
  );
}
function Review({
  issue,
  onResolved,
  who,
}: {
  issue: ReconciliationIssue;
  who: (id: string | undefined) => string;
  onResolved: (receipt: NonNullable<ReconciliationIssue["resolution"]>) => void;
}) {
  const [kind, setKind] = useState("no_effect_after_review");
  const [note, setNote] = useState("");
  const [evidenceKind, setEvidenceKind] = useState("invoice_split");
  const [evidenceId, setEvidenceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function resolve(e: React.FormEvent) {
    e.preventDefault();
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
            "The review receipt could not be confirmed. Sign in and try again.",
        );
      if (active.current) onResolved(result);
    } catch (e) {
      if (active.current)
        setError(
          e instanceof Error ? e.message : "The review could not be recorded.",
        );
    } finally {
      if (active.current) setBusy(false);
    }
  }
  return (
    <div className={xa.block}>
      <h2 className={xa.heading}>
        {((r) => r.charAt(0).toUpperCase() + r.slice(1))(
          issue.reason.replaceAll("_", " "),
        )}
      </h2>
      <p className={xa.note}>
        {issue.account_id} · {issue.event_type} · {issue.event_id}
      </p>
      <p className={xa.body}>Stripe record: {issue.object_id ?? "not given"}</p>
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
        <form onSubmit={resolve} className={xa.form}>
          <XaSelect
            label="What you found in Stripe and the ledger"
            options={[
              {
                value: "no_effect_after_review",
                label: "No financial effect after review",
              },
              {
                value: "effect_confirmed",
                label: "Existing ledger effect confirmed",
              },
            ]}
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            disabled={busy}
          />
          <XaTextArea
            label="What you checked and why"
            required
            minLength={20}
            maxLength={5000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={busy}
          />
          {kind === "effect_confirmed" ? (
            <>
              <XaSelect
                label="Which ledger record proves it"
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
                required
                value={evidenceId}
                onChange={(e) => setEvidenceId(e.target.value)}
                disabled={busy}
              />
            </>
          ) : null}
          <p className={xa.note}>
            Recording keeps your finding with your name. It does not charge,
            refund, transfer or retry a payment.
          </p>
          <XaButton type="submit" disabled={busy}>
            {busy ? "Recording…" : "Record review"}
          </XaButton>
          {error ? <p role="alert">{error}</p> : null}
        </form>
      )}
    </div>
  );
}
