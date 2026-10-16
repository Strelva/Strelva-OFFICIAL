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
    : "date not recorded";
};
/** Whoever proposed, by name; the email only when no name is recorded. */
function proposerLabel(item: PayerTransition) {
  return item.proposerName?.trim() || item.proposerEmail;
}
const STATUS_WORDS: Record<PayerTransition["status"], string> = {
  pending: "Waiting for an answer",
  accepted: "Accepted",
  rejected: "Declined",
  revoked: "Withdrawn",
  stale: "Expired",
};
type Kind = "business" | "agency" | "user";

/** Who pays for future jobs (XA · R4 language): one sentence for today, the waiting change beside it, then the choice. */
export function WorkspacePayerTransition({
  workspaceId,
  canPropose,
  agencyChoices = [],
  agencyChoicesError = "",
  providerChangeEnabled = false,
  request = fetch,
}: {
  workspaceId: string;
  canPropose: boolean;
  agencyChoices?: { id: string; name: string }[];
  agencyChoicesError?: string;
  providerChangeEnabled?: boolean;
  request?: typeof fetch;
}) {
  const [data, setData] = useState<PayerTransitionSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [successorKind, setSuccessorKind] = useState<Kind>("business");
  const [successorAgencyWorkspaceId, setSuccessorAgencyWorkspaceId] =
    useState("");
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
          throw new Error(body.error ?? "Payer history could not be loaded.");
        setData(body);
      } catch (cause) {
        if (!signal?.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Payer history could not be loaded.",
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
          result.error ?? "The payer change could not be confirmed.",
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
          ? "This proposal became stale because its proposer is no longer a business owner."
          : body.action === "accept"
            ? "You accepted responsibility for future jobs."
            : body.action === "reject"
              ? "You declined this payer change."
              : body.action === "revoke"
                ? "The pending payer change was withdrawn."
                : "Payer change proposed. Someone who can sign for the proposed payer accepts it.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The payer change could not be confirmed.",
      );
    } finally {
      setBusy(false);
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
          result.error ?? "The agency handoff could not be confirmed.",
        );
      setProviderChange(result);
      setNotice(
        result.status === "completed"
          ? "The agency handoff is complete. Existing sites and money records are kept."
          : result.status === "awaiting_policy"
            ? "Your handoff request is saved. The agency's response policy must be approved before it can go ahead."
            : "Your handoff request is saved. The outgoing agency gets its notice and response window before it completes.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The agency handoff could not be confirmed.",
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
        Who pays for future jobs
      </XaLabel>
      {!data && !error ? (
        <p className={styles.note} role="status">
          Reading who pays…
        </p>
      ) : null}
      {data ? (
        <p className={styles.body}>
          {data.current ? (
            <>
              {successorLabel(data.current)} pays for jobs started after{" "}
              {when(data.current.acceptedAt)}.
            </>
          ) : (
            "This business pays. No other payer has accepted future jobs."
          )}{" "}
          Existing budgets, holds and recorded costs keep their original payer.
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
            Use {successorLabel(data.current)} for an agency handoff. Strelva
            checks again that you own the business and that this payer still
            accepts. Existing sites and agreements stay as they are; any new
            price needs its own yes.
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
                ? "Agency handoff complete"
                : providerChange?.status === "notified"
                  ? "Complete after the response window"
                  : "Request agency handoff"}
            </XaButton>
          </div>
        </div>
      ) : null}
      {pending ? (
        <div
          className={styles.waiting}
          role="group"
          aria-label="Payer change waiting for an answer"
        >
          <p className={styles.line}>
            <strong>{successorLabel(pending)} as payer for future jobs</strong>{" "}
            <XaStatus kind="waits" size="sm">
              Waiting for{" "}
              {pending.successorKind === "business"
                ? "a business owner"
                : successorLabel(pending)}
            </XaStatus>
            <span className={styles.lineActions}>
              {addressed ? (
                <>
                  <XaTextLink
                    disabled={busy}
                    onClick={() =>
                      void command({
                        action: "accept",
                        transitionId: pending.id,
                      })
                    }
                  >
                    Accept future payer role
                  </XaTextLink>
                  <span aria-hidden="true">·</span>
                  <XaTextLink
                    disabled={busy}
                    onClick={() =>
                      void command({
                        action: "reject",
                        transitionId: pending.id,
                      })
                    }
                  >
                    Decline
                  </XaTextLink>
                </>
              ) : null}
              {addressed && canPropose ? (
                <span aria-hidden="true">·</span>
              ) : null}
              {canPropose ? (
                <XaTextLink
                  disabled={busy}
                  onClick={() =>
                    void command({ action: "revoke", transitionId: pending.id })
                  }
                >
                  Withdraw
                </XaTextLink>
              ) : null}
            </span>
          </p>
          <p className={styles.note}>
            {proposerLabel(pending)} proposed it on {when(pending.proposedAt)}.{" "}
            {pending.successorKind === "agency"
              ? "Only an owner or admin of this agency can accept."
              : pending.successorKind === "business"
                ? "A business owner accepts."
                : "Only this person can accept, after confirming their email."}
          </p>
        </div>
      ) : canPropose && data ? (
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            if (successorKind === "agency" && agencyMissing) return;
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
                      successorEmail: form.get("successorEmail"),
                    },
            );
          }}
        >
          <XaDoors
            label="Change who pays for future jobs"
            name="payerKind"
            value={successorKind}
            onChange={setSuccessorKind}
            options={[
              {
                value: "business",
                label: "This business",
                detail:
                  "A business owner accepts. Existing job limits and agreements stay.",
              },
              {
                value: "agency",
                label: "An agency serving you",
                detail:
                  "The agency accepts from its billing page. You do not need to join its team.",
              },
              {
                value: "user",
                label: "A named person who signs for the business",
                detail: "They accept after confirming their email.",
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
                required
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
                No agency is serving this business yet. Bring in an agency
                before asking it to pay.{" "}
                <XaTextLink
                  href={`/workspace?view=help&workspaceId=${encodeURIComponent(workspaceId)}`}
                >
                  Choose an agency
                </XaTextLink>
              </p>
            )
          ) : successorKind === "user" ? (
            <XaField
              label="Their email"
              name="successorEmail"
              type="email"
              maxLength={254}
              required
            />
          ) : null}
          <div className={styles.actions}>
            <XaButton type="submit" disabled={busy || agencyMissing}>
              Propose this payer
            </XaButton>
          </div>
        </form>
      ) : !canPropose && data && !pending ? (
        <p className={styles.note}>
          Only a business owner can propose a new payer.
        </p>
      ) : null}
      {data?.transitions.length ? (
        <details className={styles.history}>
          <summary className={styles.detailsToggle}>
            Earlier payer changes
          </summary>
          <XaRows label="Earlier payer changes">
            {data.transitions.map((item) => (
              <XaRow
                key={item.id}
                title={successorLabel(item)}
                detail={`${proposerLabel(item)} proposed it on ${when(item.proposedAt)}`}
                meta={STATUS_WORDS[item.status]}
              />
            ))}
          </XaRows>
        </details>
      ) : null}
    </section>
  );
}
