"use client";

import { useCallback, useEffect, useState } from "react";
import { XaTextLink, XaYes } from "@/components/ui/strelva/Xa";
import { proposerLabel } from "@/experience/workspace/billing/AgencyPayerRequests";
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
  const waiting = [
    ...jobs
      .filter((job) => job.status === "draft")
      .map((job) => ({ kind: "job" as const, id: job.id, job })),
    ...pending.map((item) => ({ kind: "payer" as const, id: item.id, item })),
  ];
  const settledJobs = jobs.filter((job) => job.status !== "draft");
  const first = waiting[0]?.id;
  const payerName = (item: (typeof pending)[number]) =>
    item.successorKind === "agency"
      ? (item.successorWorkspaceName ?? "your agency")
      : item.successorKind === "business"
        ? "this business"
        : "you";
  return (
    <div className={styles.section}>
      {data ? (
        <p className={styles.heading}>
          {waiting.length
            ? `${waiting.length === 1 ? "1 thing waits" : `${waiting.length} things wait`} for your yes.`
            : "Nothing waits for your yes."}
        </p>
      ) : null}
      {error ? (
        <p className={styles.critical} role="alert">
          {error}
        </p>
      ) : null}
      {data && !waiting.length && !accepted.length && !settledJobs.length ? (
        <p className={styles.body}>
          No payer requests or job limits are addressed to this account.
        </p>
      ) : null}
      {waiting.length || accepted.length || settledJobs.length ? (
        <ul className={styles.inbox} aria-label="Payer requests and job limits">
          {waiting.map((entry) => {
            const going = busy === entry.id;
            const title =
              entry.kind === "job"
                ? `${entry.job.workspaceName} · up to ${money(entry.job.maxAuthorizedCents)} for one job`
                : `Future jobs for ${entry.item.workspaceName}`;
            const detail =
              entry.kind === "job"
                ? `${entry.job.estimateCents === null ? "No estimate yet" : `${money(entry.job.estimateCents)} estimated`}, ${money(entry.job.reservedCents)} held, ${money(entry.job.usedCents)} used so far. The record leaves out the work and the business's data.`
                : `${proposerLabel(entry.item)} asked ${payerName(entry.item)} to pay for jobs started after you accept. It gives no access to the business or its saved work; each job limit still needs its own yes.`;
            const accept = () =>
              entry.kind === "job"
                ? void acceptJob(entry.job.id)
                : void transition("accept", entry.item.id);
            const decline =
              entry.kind === "payer"
                ? () => void transition("reject", entry.item.id)
                : undefined;
            return (
              <li key={entry.id} aria-label={title}>
                <p className={styles.inboxTitle}>
                  <span>{title}</span>
                  {entry.id !== first ? (
                    <span className={styles.links}>
                      <XaTextLink
                        disabled={Boolean(busy)}
                        onClick={accept}
                        aria-label={`Accept ${title}`}
                      >
                        Accept
                      </XaTextLink>
                      {decline ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <XaTextLink
                            disabled={Boolean(busy)}
                            onClick={decline}
                          >
                            Not yet
                          </XaTextLink>
                        </>
                      ) : null}
                    </span>
                  ) : null}
                </p>
                <p className={styles.note}>{detail}</p>
                {entry.id === first ? (
                  <div className={styles.yesSlot}>
                    <XaYes
                      state={going ? "going" : "waiting"}
                      yesLabel={
                        entry.kind === "job"
                          ? `Accept ${money(entry.job.maxAuthorizedCents)} job limit`
                          : "Accept future payer role"
                      }
                      notYetLabel="Not yet"
                      onYes={accept}
                      onNotYet={decline}
                      block={false}
                      working={{
                        title: "Recording your yes",
                        steps: [
                          {
                            id: "accept",
                            label: "Saving this exact amount with your name",
                            state: "active",
                          },
                        ],
                      }}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
          {accepted.map((item) => (
            <li key={item.id}>
              <p className={styles.body}>
                You pay future jobs for {item.workspaceName}
                {item.successorKind === "agency"
                  ? `, through ${item.successorWorkspaceName ?? "the agency"}`
                  : ""}
                . Only jobs started after you accepted can name you, and each
                job limit stays separate.
              </p>
            </li>
          ))}
          {settledJobs.map((job) => (
            <li key={job.id}>
              <p className={styles.inboxTitle}>
                <span>
                  {job.workspaceName} · up to {money(job.maxAuthorizedCents)}{" "}
                  for one job
                </span>
                <span className={styles.figureQuiet}>
                  {job.actualKnown && job.actualCents !== null
                    ? `Final cost ${money(job.actualCents)}`
                    : `${money(job.usedCents)} used so far`}
                </span>
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
