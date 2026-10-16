"use client";

import { useCallback, useEffect, useState } from "react";
import { XaTextLink, XaYes } from "@/components/ui/strelva/Xa";
import { proposerLabel } from "@/experience/workspace/billing/AgencyPayerRequests";
import styles from "@/experience/workspace/money/money.module.css";
import type { PayerTransitionSnapshot } from "@/platform/work-economics/payer-transitions";

/** Asks to pay for Strelva work, addressed to this account, each with its one answer. `request` lets the preview supply fixtures. */
export function AccountPayerInbox({
  request = fetch,
}: { request?: typeof fetch } = {}) {
  const [data, setData] = useState<PayerTransitionSnapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  // One yes at a time (October 16): the chosen ask holds the one XaYes; the rest wait their turn.
  const [chosen, setChosen] = useState("");
  const load = useCallback(async () => {
    const response = await request("/api/work-economics/payer-transition", {
      cache: "no-store",
    });
    const body = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(body?.error ?? "These asks couldn’t be read just now.");
    setData(body);
  }, [request]);
  useEffect(() => {
    void load().catch((cause) =>
      setError(
        cause instanceof Error
          ? cause.message
          : "These asks couldn’t be read just now.",
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
          body?.error ?? "Your answer didn’t go through. Nothing changed.",
        );
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your answer didn’t go through. Nothing changed.",
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
        throw new Error(body?.error ?? "Your answer didn’t go through. Nothing changed.");
      setData(body);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your answer didn’t go through. Nothing changed.",
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
        Reading what waits for you…
      </p>
    );
  const waiting = [
    ...jobs
      .filter((job) => job.status === "draft")
      .map((job) => ({ kind: "job" as const, id: job.id, job })),
    ...pending.map((item) => ({ kind: "payer" as const, id: item.id, item })),
  ];
  const settledJobs = jobs.filter((job) => job.status !== "draft");
  const first = waiting.some((entry) => entry.id === chosen)
    ? chosen
    : waiting[0]?.id;
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
          Nobody has asked you to pay for Strelva work.
        </p>
      ) : null}
      {waiting.length || accepted.length || settledJobs.length ? (
        <ul className={styles.inbox} aria-label="Asks to pay for Strelva work">
          {waiting.map((entry) => {
            const going = busy === entry.id;
            const title =
              entry.kind === "job"
                ? `One piece of Strelva work for ${entry.job.workspaceName}`
                : `Strelva work for ${entry.item.workspaceName}, from now on`;
            // No Strelva price figure while pricing is undecided (October 16): the limit is said, not priced.
            const detail =
              entry.kind === "job"
                ? "It has a set limit and never goes past it without asking you again. Nothing is charged for Strelva work until plans open. You don’t see the business’s records."
                : `${proposerLabel(entry.item)} asked ${payerName(entry.item)} to pay for Strelva work started after you say yes. You don’t get into the business or its records, and each larger piece of work still asks you first.`;
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
                    <XaTextLink
                      disabled={Boolean(busy)}
                      onClick={() => setChosen(entry.id)}
                      aria-label={`Answer: ${title}`}
                    >
                      Answer this one
                    </XaTextLink>
                  ) : null}
                </p>
                <p className={styles.note}>{detail}</p>
                {entry.id === first ? (
                  <div className={styles.yesSlot}>
                    <XaYes
                      state={going ? "going" : "waiting"}
                      yesLabel={
                        entry.kind === "job" ? "Agree to pay for it" : "Agree to pay"
                      }
                      yesAriaLabel={`Agree to pay: ${title}`}
                      notYetLabel="Not yet"
                      onYes={accept}
                      onNotYet={decline}
                      block={false}
                      working={{
                        title: "Saving your yes",
                        steps: [
                          {
                            id: "accept",
                            label: "Keeping your answer with your name",
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
                You pay for Strelva work for {item.workspaceName}
                {item.successorKind === "agency"
                  ? `, through ${item.successorWorkspaceName ?? "the agency"}`
                  : ""}
                , counting from the day you said yes.
              </p>
            </li>
          ))}
          {settledJobs.map((job) => (
            <li key={job.id}>
              <p className={styles.inboxTitle}>
                <span>
                  One piece of Strelva work for {job.workspaceName}
                </span>
                <span className={styles.figureQuiet}>
                  {job.actualKnown && job.actualCents !== null
                    ? "Done"
                    : "Still running"}
                </span>
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
