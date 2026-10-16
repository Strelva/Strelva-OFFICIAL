"use client";

import { useCallback, useEffect, useState } from "react";
import {
  XaButton,
  XaDoors,
  XaField,
  XaLabel,
  XaRow,
  XaRows,
  XaSelect,
  XaStatus,
  XaTextLink,
  XaYes,
} from "@/components/ui/strelva/Xa";
import type {
  PayerTransition,
  PayerTransitionSnapshot,
} from "@/platform/work-economics/payer-transitions";
import styles from "@/experience/workspace/money/money.module.css";

/** Who would pay: a person, an agency, or the business itself. */
function successorLabel(item: PayerTransition): string {
  if (item.successorKind === "agency")
    return item.successorWorkspaceName ?? "An agency";
  if (item.successorKind === "business") return "This business";
  return item.successorEmail;
}
const when = (iso: string | null | undefined) => {
  const value = iso ? new Date(iso) : null;
  return value && Number.isFinite(value.getTime())
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(value)
    : "an unknown day";
};
/** Whoever proposed, by name; the email only when no name is recorded. */
function proposerLabel(item: PayerTransition) {
  return item.proposerName?.trim() || item.proposerEmail;
}
const STATUS_WORDS: Record<PayerTransition["status"], string> = {
  pending: "Waiting for an answer",
  accepted: "Agreed",
  rejected: "Declined",
  revoked: "Withdrawn",
  stale: "Lapsed",
};
type Kind = "business" | "agency" | "user";
type BilledTo = { kind: "business" | "agency"; workspaceId: string; name: string | null };

/** True when a payer change names the same party as the billing record. */
function samePayer(item: PayerTransition, billed: BilledTo) {
  if (billed.kind === "agency")
    return item.successorKind === "agency" && item.successorWorkspaceId === billed.workspaceId;
  return item.successorKind === "business";
}

/**
 * Who pays today, in one sentence. The agreed change and the billing record
 * usually say the same thing; when they don't, the agreed change counts for
 * new work and the sentence says so.
 */
function payerSentence(current: PayerTransition | null, billed: BilledTo | null): string {
  if (current) {
    const agreed = `${successorLabel(current)} pays for work started after ${when(current.acceptedAt)}.`;
    if (!billed || samePayer(current, billed)) return agreed;
    const record = billed.kind === "agency" ? (billed.name ?? "an agency") : "this business";
    return `${agreed} The billing record still names ${record}; the agreed change is the one that counts.`;
  }
  if (billed?.kind === "agency")
    return `${billed.name ?? "Your agency"} pays for this business’s Strelva work.`;
  return "This business pays for its own Strelva work.";
}

/** Who pays for future jobs (XA · R4 language): one sentence for today, the waiting change beside it, then the choice. */
export function WorkspacePayerTransition({
  workspaceId,
  canPropose,
  agencyChoices = [],
  agencyChoicesError = "",
  providerChangeEnabled = false,
  billedTo = null,
  request = fetch,
}: {
  workspaceId: string;
  canPropose: boolean;
  agencyChoices?: { id: string; name: string }[];
  agencyChoicesError?: string;
  providerChangeEnabled?: boolean;
  /**
   * Who the billing record says pays for this plan (BusinessBilling.payerParty).
   * The page's headline and Pebble read the same record, so this section says
   * the same payer; when an agreed change disagrees, it says which one counts.
   */
  billedTo?: { kind: "business" | "agency"; workspaceId: string; name: string | null } | null;
  request?: typeof fetch;
}) {
  const [data, setData] = useState<PayerTransitionSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [successorKind, setSuccessorKind] = useState<Kind>("business");
  const [successorAgencyWorkspaceId, setSuccessorAgencyWorkspaceId] =
    useState("");
  const [changing, setChanging] = useState(false);
  const [answering, setAnswering] = useState<"accept" | "reject" | null>(null);
  const [formError, setFormError] = useState("");
  const [providerChange, setProviderChange] = useState<{
    id: string;
    status: string;
  } | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setError("");
      try {
        const response = await request(
          `/api/work-economics/payer-transition?workspaceId=${encodeURIComponent(workspaceId)}`,
          { cache: "no-store", signal },
        );
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error ?? "Who pays couldn’t be read just now.");
        setData(body);
      } catch (cause) {
        if (!signal?.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Who pays couldn’t be read just now.",
          );
      }
    },
    [workspaceId, request],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  // Pebble's "Pay directly instead" on the billing page proposes a payer; read it back here.
  useEffect(() => {
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<{ workspaceId?: string }>).detail;
      if (detail?.workspaceId === workspaceId) void load();
    };
    window.addEventListener("strelva:payer-transition", changed);
    return () =>
      window.removeEventListener("strelva:payer-transition", changed);
  }, [load, workspaceId]);

  async function command(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await request("/api/work-economics/payer-transition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error ?? "That didn’t go through. Nothing changed.",
        );
      if (body.action === "accept") setProviderChange(null);
      const scoped = {
        ...result,
        transitions: result.transitions.filter(
          (item: PayerTransition) => item.workspaceId === workspaceId,
        ),
      };
      scoped.current =
        scoped.transitions.find(
          (item: PayerTransition) => item.status === "accepted",
        ) ?? null;
      scoped.pending =
        scoped.transitions.find(
          (item: PayerTransition) => item.status === "pending",
        ) ?? null;
      setData(scoped);
      const resolved =
        typeof body.transitionId === "string"
          ? scoped.transitions?.find(
              (item: { id: string }) => item.id === body.transitionId,
            )
          : null;
      setNotice(
        body.action === "accept" && resolved?.status === "stale"
          ? "This ask lapsed because the person who made it no longer owns the business."
          : body.action === "accept"
            ? "You now pay for Strelva work from here on."
            : body.action === "reject"
              ? "You said no. Nothing changed."
              : body.action === "revoke"
                ? "You took the ask back. Nothing changed."
                : "Asked. It changes once they say yes.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "That didn’t go through. Nothing changed.",
      );
    } finally {
      setBusy(false);
      setChanging(false);
    }
  }

  async function requestProviderChange(complete = false) {
    const current = data?.current;
    if (
      busy ||
      !current ||
      current.status !== "accepted" ||
      current.successorKind === "user"
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await request("/api/workspace/provider-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          complete && providerChange
            ? { action: "complete", requestId: providerChange.id }
            : {
                action: "request",
                workspaceId,
                agencyWorkspaceId:
                  current.successorKind === "agency"
                    ? current.successorWorkspaceId
                    : null,
                payerTransitionId: current.id,
                idempotencyKey: `provider-payer:${current.id}`,
              },
        ),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error ?? "The move to a new agency didn’t go through.",
        );
      setProviderChange(result);
      setNotice(
        result.status === "completed"
          ? "The move is done. Your sites and payments stay as they were."
          : result.status === "awaiting_policy"
            ? "Your ask is saved. It goes ahead once Strelva approves how the agency answers."
            : "Your ask is saved. Your current agency hears about it and has time to answer first.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The move to a new agency didn’t go through.",
      );
    } finally {
      setBusy(false);
    }
  }

  const pending = data?.pending;
  const addressed = Boolean(
    pending &&
    (pending.canRespond || pending.successorUserId === data?.currentActorId),
  );
  const agencyMissing =
    successorKind === "agency" &&
    (Boolean(agencyChoicesError) ||
      !agencyChoices.some(
        (agency) => agency.id === successorAgencyWorkspaceId,
      ));
  return (
    <section
      id="who-pays"
      className={styles.section}
      aria-labelledby="payer-transition-heading"
    >
      <XaLabel as="h2" id="payer-transition-heading">
        Who pays for Strelva work
      </XaLabel>
      {!data && !error ? (
        <p className={styles.note} role="status">
          Reading who pays…
        </p>
      ) : null}
      {data ? (
        <p className={styles.body}>
          {payerSentence(data.current, billedTo)} A change only counts from the
          day it&rsquo;s agreed.
        </p>
      ) : null}
      {error ? (
        <p className={styles.critical} role="alert">
          {error} <XaTextLink onClick={() => void load()}>Try again</XaTextLink>
        </p>
      ) : null}
      {notice ? (
        <p className={styles.body} role="status">
          {notice}
        </p>
      ) : null}
      {providerChangeEnabled &&
      canPropose &&
      data?.current &&
      data.current.successorKind !== "user" ? (
        <div className={styles.section}>
          <p className={styles.body}>
            Moving to {successorLabel(data.current)} as your agency keeps your
            sites and agreements as they are. Any new price still needs your
            yes.
          </p>
          <div className={styles.actions}>
            <XaButton
              size="sm"
              disabled={busy || providerChange?.status === "completed"}
              onClick={() =>
                void requestProviderChange(
                  providerChange?.status === "notified",
                )
              }
            >
              {providerChange?.status === "completed"
                ? "Moved"
                : providerChange?.status === "notified"
                  ? "Finish the move"
                  : "Move to this agency"}
            </XaButton>
          </div>
        </div>
      ) : null}
      {pending ? (
        <div
          className={styles.waiting}
          role="group"
          aria-label="A change to who pays, waiting for an answer"
        >
          {/* The ask, then its state on its own line, then the answers: nothing orphans when it wraps. */}
          <p className={styles.waitingTitle}>
            {successorLabel(pending)} to pay from now on
          </p>
          <XaStatus kind="waits" size="sm">
            Waiting for{" "}
            {pending.successorKind === "business"
              ? "a business owner"
              : successorLabel(pending)}
          </XaStatus>
          <p className={styles.note}>
            {proposerLabel(pending)} asked on {when(pending.proposedAt)}.{" "}
            {pending.successorKind === "agency"
              ? "An owner or admin of the agency answers."
              : pending.successorKind === "business"
                ? "The business owner answers."
                : "They answer after confirming their email."}
          </p>
          {addressed ? (
            <XaYes
              state={busy && answering === "accept" ? "going" : error && answering === "accept" ? "failed" : "waiting"}
              yesLabel="Agree to pay"
              notYetLabel="Decline"
              block={false}
              onYes={() => {
                setAnswering("accept");
                void command({ action: "accept", transitionId: pending.id });
              }}
              onNotYet={busy ? undefined : () => {
                setAnswering("reject");
                void command({ action: "reject", transitionId: pending.id });
              }}
              working={{
                title: "Saving your yes",
                steps: [{ id: "accept", label: "Keeping your answer with your name", state: "active" }],
              }}
              failure={error || undefined}
            />
          ) : null}
          {canPropose ? (
            <p className={styles.links}>
              <XaTextLink
                disabled={busy}
                onClick={() =>
                  void command({ action: "revoke", transitionId: pending.id })
                }
              >
                Take it back
              </XaTextLink>
            </p>
          ) : null}
        </div>
      ) : canPropose && data && !changing ? (
        <p className={styles.note}>
          <XaTextLink
            onClick={() => {
              setChanging(true);
              setNotice("");
            }}
          >
            Change who pays
          </XaTextLink>
        </p>
      ) : canPropose && data ? (
        <form
          className={styles.form}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            setFormError("");
            if (successorKind === "agency" && agencyMissing) {
              setFormError("Choose the agency you want to ask.");
              return;
            }
            const email = String(form.get("successorEmail") ?? "").trim();
            if (
              successorKind === "user" &&
              !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
            ) {
              setFormError("Write their email, like dana@example.com.");
              return;
            }
            void command(
              successorKind === "agency"
                ? {
                    action: "propose",
                    workspaceId,
                    successorAgencyWorkspaceId: form.get(
                      "successorAgencyWorkspaceId",
                    ),
                  }
                : successorKind === "business"
                  ? {
                      action: "propose",
                      workspaceId,
                      successorKind: "business",
                    }
                  : {
                      action: "propose",
                      workspaceId,
                      successorEmail: email,
                    },
            );
          }}
        >
          <XaDoors
            label="Who should pay from now on"
            name="payerKind"
            value={successorKind}
            onChange={setSuccessorKind}
            options={[
              {
                value: "business",
                label: "This business",
                detail: "The business owner says yes. Your agreements stay.",
              },
              {
                value: "agency",
                label: "An agency serving you",
                detail:
                  "The agency says yes on its side. You don’t join its team.",
              },
              {
                value: "user",
                label: "Someone who signs for the business",
                detail: "They say yes after confirming their email.",
              },
            ]}
          />
          {successorKind === "agency" ? (
            agencyChoicesError ? (
              <p className={styles.critical} role="alert">
                {agencyChoicesError}{" "}
                <XaTextLink
                  href={`/workspace/billing?workspaceId=${encodeURIComponent(workspaceId)}`}
                >
                  Reload
                </XaTextLink>
              </p>
            ) : agencyChoices.length ? (
              <XaSelect
                label="Agency"
                name="successorAgencyWorkspaceId"
                value={successorAgencyWorkspaceId}
                onChange={(event) =>
                  setSuccessorAgencyWorkspaceId(event.target.value)
                }
                disabled={busy}
                error={formError || undefined}
                options={[
                  { value: "", label: "Choose your agency" },
                  ...agencyChoices.map((agency) => ({
                    value: agency.id,
                    label: agency.name,
                  })),
                ]}
              />
            ) : (
              <p className={styles.body}>
                No agency works with this business yet. Bring one in first.{" "}
                <XaTextLink
                  href={`/workspace?view=help&workspaceId=${encodeURIComponent(workspaceId)}`}
                >
                  Bring in an agency
                </XaTextLink>
              </p>
            )
          ) : successorKind === "user" ? (
            <XaField
              label="Their email"
              name="successorEmail"
              type="email"
              maxLength={254}
              error={formError || undefined}
            />
          ) : null}
          <div className={styles.actions}>
            <XaButton type="submit" busy={busy} disabled={busy}>
              Ask them
            </XaButton>
            <XaButton
              variant="quiet"
              disabled={busy}
              onClick={() => {
                setChanging(false);
                setFormError("");
              }}
            >
              Not yet
            </XaButton>
          </div>
        </form>
      ) : !canPropose && data && !pending ? (
        <p className={styles.note}>
          Only the business owner can change who pays.
        </p>
      ) : null}
      {data?.transitions.length ? (
        <details className={styles.history}>
          <summary className={styles.detailsToggle}>
            Earlier changes to who pays
          </summary>
          <XaRows label="Earlier changes to who pays">
            {data.transitions.map((item) => (
              <XaRow
                key={item.id}
                title={successorLabel(item)}
                detail={`${proposerLabel(item)} asked on ${when(item.proposedAt)}`}
                meta={STATUS_WORDS[item.status]}
              />
            ))}
          </XaRows>
        </details>
      ) : null}
    </section>
  );
}
