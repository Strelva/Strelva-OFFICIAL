"use client";

import { useState } from "react";
import { XaButton, XaSays } from "@/components/ui/strelva/Xa";
import { PlanWaitlist, type PlanWaitlistProps } from "./PlanWaitlist";
import styles from "@/experience/workspace/money/money.module.css";

import type {
  AiControlsState,
  BusinessAiBudget,
} from "@/platform/infra/business-ai-budget";

/** A reset or change day. The period boundary is a calendar day, so it reads the same everywhere. */
const monthDay = (iso: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
const validDay = (iso: string | null | undefined): iso is string =>
  Boolean(iso && Number.isFinite(Date.parse(iso)));

/** What the agency or Strelva set for this business, named. Nothing renders without a controls row. */
function AgencyUsageControlLines({
  controls,
  resetsAt,
}: {
  controls: AiControlsState;
  resetsAt: string | null;
}) {
  const agency =
    controls.setBy?.kind === "agency" && controls.setBy.agencyName
      ? controls.setBy.agencyName
      : null;
  const lines: string[] = [];
  if (controls.paused)
    lines.push(
      `${agency ?? "A Strelva operator"} paused Strelva work for this business${validDay(controls.changedAt) ? ` on ${monthDay(controls.changedAt)}` : ""}.`,
    );
  if (controls.monthlyCapCents !== null)
    lines.push(
      `${agency ?? "Strelva"} set a monthly limit on Strelva work here.${validDay(resetsAt) ? ` It resets ${monthDay(resetsAt)}.` : ""}`,
    );
  return lines.length ? (
    <div className={styles.section}>
      {lines.map((line) => (
        <p
          key={line}
          className={controls.paused ? styles.critical : styles.body}
        >
          {line}
        </p>
      ))}
    </div>
  ) : null;
}

/**
 * This month's Strelva work, in one sentence (XA · R1). October 16 money
 * decision: no dollar figure, so usage reads as a share of the month's limit
 * and its reset day. Server-authorized; never infer a limit or a reset from
 * the browser.
 */
export function BusinessAiBudgetSummary({
  budget,
  capUsd,
  enforced,
  controls = null,
}: {
  budget: BusinessAiBudget | null;
  capUsd: number | null;
  enforced?: boolean;
  controls?: AiControlsState | null;
}) {
  const known =
    budget &&
    Number.isFinite(Number(budget.spentUsd)) &&
    Number.isFinite(Number(budget.reservedUsd)) &&
    Number.isFinite(Date.parse(budget.resetsAt));
  const used = known ? Number(budget.spentUsd) + Number(budget.reservedUsd) : null;
  const incomplete = Boolean(known && budget.unknownCostCalls > 0);
  const limited = capUsd !== null && Number.isFinite(capUsd) && capUsd > 0;
  const share =
    used !== null && limited && !incomplete
      ? Math.min(100, Math.round((used / capUsd) * 100))
      : null;
  const resets = known ? ` It resets ${monthDay(budget.resetsAt)}.` : "";
  const sentence = !known
    ? "This month’s Strelva work couldn’t be read just now."
    : incomplete
      ? "Some of this month’s Strelva work hasn’t been tallied yet."
      : share === null
        ? "There’s no monthly limit on Strelva work here."
        : share >= 100
          ? `This month’s Strelva work is used up.${resets}`
          : share === 0
            ? `No Strelva work is used yet this month.${resets}`
            : `${share}% of this month’s Strelva work is used.${resets}`;
  const problem = !known
    ? "Strelva holds new work until it can read this month again. Nothing already running stops."
    : incomplete
      ? capUsd === null
        ? "There’s no monthly limit here, so nothing is held while it’s tallied."
        : "Strelva holds new work until the tally is done. Nothing already running stops."
      : null;
  return (
    <section className={styles.section} aria-label="This month">
      <p className={styles.body}>{sentence}</p>
      {controls ? (
        <AgencyUsageControlLines
          controls={controls}
          resetsAt={budget?.resetsAt ?? null}
        />
      ) : null}
      {enforced ? (
        problem ? (
          <XaSays>{problem}</XaSays>
        ) : null
      ) : (
        <p className={styles.note}>
          Nothing is charged for Strelva work until plans open.
        </p>
      )}
    </section>
  );
}

type Transport = (input: string, init?: RequestInit) => Promise<Response>;

/** The owner starts the business's own plan (ADR 0015). Checkout happens on Stripe; nothing is charged here. */
export function StartWorkspacePlan({
  primary = true,
  workspaceId,
  budget = null,
  capUsd = null,
  budgetEnforced,
  controls = null,
  transport = fetch,
  navigate = (url: string) => window.location.assign(url),
}: {
  /** False when another decision on the screen already holds the one ink pill. */
  primary?: boolean;
  workspaceId: string;
  budget?: BusinessAiBudget | null;
  capUsd?: number | null;
  budgetEnforced?: boolean;
  controls?: AiControlsState | null;
  transport?: Transport;
  navigate?: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function start() {
    setBusy(true);
    setError("");
    try {
      const response = await transport("/api/workspace/billing-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      const body = (await response.json()) as {
        checkoutUrl?: string;
        error?: string;
      };
      if (!response.ok || !body.checkoutUrl)
        throw new Error(
          body.error || "Stripe couldn’t be opened. Nothing was charged.",
        );
      navigate(body.checkoutUrl);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Stripe couldn’t be opened. Nothing was charged.",
      );
      setBusy(false);
    }
  }
  return (
    <>
      <section
        className={styles.section}
        aria-label="Choose a plan"
      >
        <p className={styles.body}>
          Stripe shows the plan and what it includes before anything is charged.
          You can bring in an agency anytime.
        </p>
        <div className={styles.actions}>
          <XaButton
            variant={primary ? "primary" : "secondary"}
            busy={busy}
            disabled={busy}
            onClick={() => void start()}
          >
            Choose a plan
          </XaButton>
        </div>
        {error ? (
          <p className={styles.critical} role="alert">
            {error}
          </p>
        ) : null}
      </section>
      <BusinessAiBudgetSummary
        budget={budget}
        capUsd={capUsd}
        enforced={budgetEnforced}
        controls={controls}
      />
    </>
  );
}

/**
 * Plans aren't open: the honest waitlist path, never a checkout control or an
 * invented price (October 16 money decision).
 */
export function WorkspacePlanUnavailable(props: PlanWaitlistProps) {
  return <PlanWaitlist {...props} />;
}
