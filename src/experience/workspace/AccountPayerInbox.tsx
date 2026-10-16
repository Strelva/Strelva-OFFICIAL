"use client";

import { useCallback, useEffect, useState } from "react";
import { XaAnswers, XaButton, XaStatus } from "@/components/ui/strelva/Xa";
import styles from "@/experience/workspace/money/money.module.css";
import type { PayerTransitionSnapshot } from "@/platform/work-economics/payer-transitions";

const money = (cents: number) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);

/** Payer requests and job limits addressed to this account, each with its one answer. `request` lets the preview supply fixtures. */
export function AccountPayerInbox({
  request = fetch,
}: { request?: typeof fetch } = {}) {
  const [data, setData] = useState<PayerTransitionSnapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    const response = await request("/api/work-economics/payer-transition", {
      cache: "no-store",
    });
    const body = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(body?.error ?? "Payer requests could not be loaded.");
    setData(body);
  }, [request]);
  useEffect(() => {
    void load().catch((cause) =>
      setError(
        cause instanceof Error
          ? cause.message
          : "Payer requests could not be loaded.",
      ),
    );
  }, [load]);

  async function transition(action: "accept" | "reject", transitionId: string) {
    setBusy(transitionId);
    setError("");
    try {
      const response = await request("/api/work-economics/payer-transition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, transitionId }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          body?.error ?? "The payer request could not be confirmed.",
        );
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The payer request could not be confirmed.",
      );
    } finally {
      setBusy("");
    }
  }

  async function acceptJob(jobId: string) {
    setBusy(jobId);
    setError("");
    try {
      const response = await request("/api/work-economics/payer-transition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept_job", jobId }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(body?.error ?? "The job limit could not be accepted.");
      setData(body);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The job limit could not be accepted.",
      );
    } finally {
      setBusy("");
    }
  }

  const pending =
    data?.transitions.filter((item) => item.status === "pending") ?? [];
  const accepted =
    data?.transitions.filter((item) => item.status === "accepted") ?? [];
  const jobs = data?.jobs ?? [];
  if (!data && !error)
    return (
      <p className={styles.note} role="status">
        Checking payer requests…
      </p>
    );
  return (
    <div className={styles.section}>
      {error ? (
        <p className={styles.critical} role="alert">
          {error}
        </p>
      ) : null}
      {!pending.length && !accepted.length && !jobs.length ? (
        <p className={styles.body}>
          No payer requests or job limits are addressed to this account.
        </p>
      ) : null}
      {pending.map((item) => (
        <div
          key={item.id}
          className={styles.waiting}
          role="group"
          aria-label={`Future jobs for ${item.workspaceName}`}
        >
          <div className={styles.waitingHead}>
            <p className={styles.waitingTitle}>
              Future jobs for {item.workspaceName}
            </p>
            <XaStatus kind="waits" size="sm">
              Waits for you
            </XaStatus>
          </div>
          <p className={styles.note}>
            {item.proposerEmail} asked{" "}
            {item.successorKind === "agency"
              ? (item.successorWorkspaceName ?? "your agency")
              : item.successorKind === "business"
                ? "this business"
                : "you"}{" "}
            to pay for jobs started after you accept. This gives no access to
            the business or its saved work. Each job limit still needs its own
            yes.
          </p>
          <div className={styles.actions}>
            <XaButton
              size="sm"
              disabled={busy === item.id}
              onClick={() => void transition("accept", item.id)}
            >
              Accept future payer role
            </XaButton>
            <XaButton
              size="sm"
              variant="quiet"
              disabled={busy === item.id}
              onClick={() => void transition("reject", item.id)}
            >
              Decline
            </XaButton>
          </div>
        </div>
      ))}
      {accepted.map((item) => (
        <p key={item.id} className={styles.body}>
          <XaStatus kind="live" size="sm">
            Accepted
          </XaStatus>{" "}
          You pay future jobs for {item.workspaceName}
          {item.successorKind === "agency"
            ? `, through ${item.successorWorkspaceName ?? "the agency"}`
            : ""}
          . Only jobs started after you accepted can name you, and each job
          limit stays separate.
        </p>
      ))}
      {jobs.map((job) => (
        <div
          key={job.id}
          className={styles.section}
          role="group"
          aria-label={`${job.workspaceName} job limit`}
        >
          <div className={styles.waitingHead}>
            <p className={styles.waitingTitle}>
              {job.workspaceName} · job limit
            </p>
            {job.status === "draft" ? (
              <XaStatus kind="waits" size="sm">
                Waits for you
              </XaStatus>
            ) : (
              <XaStatus kind="draft" size="sm">
                {job.status.replaceAll("_", " ")}
              </XaStatus>
            )}
          </div>
          <XaAnswers
            labelWidth={150}
            rows={[
              ["Up to", money(job.maxAuthorizedCents)],
              [
                "Estimate",
                job.estimateCents === null
                  ? "Not known yet"
                  : money(job.estimateCents),
              ],
              ["Held for the work", money(job.reservedCents)],
              ["Used so far", money(job.usedCents)],
              [
                "Final cost",
                job.actualKnown && job.actualCents !== null
                  ? money(job.actualCents)
                  : "Not settled yet",
              ],
            ]}
          />
          <p className={styles.note}>
            This money record leaves out the work&apos;s title, content and
            business data.
          </p>
          {job.status === "draft" ? (
            <div className={styles.actions}>
              <XaButton
                size="sm"
                disabled={busy === job.id}
                onClick={() => void acceptJob(job.id)}
              >
                Accept {money(job.maxAuthorizedCents)} job limit
              </XaButton>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
