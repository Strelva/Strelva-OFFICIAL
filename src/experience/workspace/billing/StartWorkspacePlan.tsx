"use client";

import { useState } from "react";
import { XaButton, XaSays, XaTextLink } from "@/components/ui/strelva/Xa";
import styles from "@/experience/workspace/money/money.module.css";

import type {
  AiControlsState,
  BusinessAiBudget,
} from "@/platform/infra/business-ai-budget";

const dollars = (amount: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    amount,
  );

/** A reset or change day. The period boundary is a calendar day, so it reads the same everywhere. */
const monthDay = (iso: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
const whole = (amount: number) => dollars(amount).replace(/\.00$/, "");

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
      `${agency ?? "A Strelva operator"} paused Strelva work for this business${controls.changedAt && Number.isFinite(Date.parse(controls.changedAt)) ? ` on ${monthDay(controls.changedAt)}` : ""}.`,
    );
  if (controls.monthlyCapCents !== null)
    lines.push(
      `Usage limit ${whole(controls.monthlyCapCents / 100)} set by ${agency ?? "Strelva"}.${resetsAt && Number.isFinite(Date.parse(resetsAt)) ? ` Resets ${monthDay(resetsAt)}.` : ""}`,
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
 * Usage this month, in one sentence (XA · R1): what was used, what running
 * jobs hold, the limit and the reset. Server-authorized; never infer a limit
 * or a reset from the browser.
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
  const spent = known ? Number(budget.spentUsd) : null;
  const reserved = known ? Number(budget.reservedUsd) : null;
  const incomplete = Boolean(known && budget.unknownCostCalls > 0);
  const limited = capUsd !== null && Number.isFinite(capUsd);
  const remaining =
    spent !== null && reserved !== null && limited && !incomplete
      ? Math.max(0, capUsd - spent - reserved)
      : null;
  const sentence = !known ? (
    "Usage this month could not be confirmed."
  ) : (
    <>
      Usage this month: <strong>{dollars(spent!)}</strong> used
      {reserved ? `, ${dollars(reserved)} held for running jobs` : ""}
      {limited ? `, of your ${whole(capUsd)} limit` : ""}.
      {remaining !== null ? ` ${dollars(remaining)} left.` : ""}
      {!limited ? " No usage limit is set." : ""} Resets{" "}
      {monthDay(budget.resetsAt)}.
    </>
  );
  const problem = !known
    ? "Usage could not be confirmed. Budgeted building stays paused until the budget can be checked."
    : incomplete
      ? capUsd === null
        ? "Recorded spend is incomplete: some past jobs have no confirmed cost yet. No spending limit is recorded for this business."
        : "Usage could not be confirmed. Budgeted building stays paused until the budget can be checked."
      : null;
  return (
    <section className={styles.section} aria-label="Usage this month">
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
        ) : (
          <p className={styles.note}>
            Each job holds the most it could cost until it finishes.
          </p>
        )
      ) : (
        <p className={styles.note}>
          {enforced === false
            ? "Usage limits are not enabled here."
            : "Your current usage limit has not been confirmed."}{" "}
          No plan price is published yet. Nothing is charged until you see one
          and agree to it.
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
          body.error || "Checkout couldn't be opened. Nothing was charged.",
        );
      navigate(body.checkoutUrl);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Checkout couldn't be opened. Nothing was charged.",
      );
      setBusy(false);
    }
  }
  return (
    <>
      <section
        className={styles.section}
        aria-label="Run your business on Strelva"
      >
        <p className={styles.body}>
          Run your business on Strelva. Your plan’s price and included usage are
          shown before you pay. You can bring in an agency anytime.
        </p>
        <div className={styles.actions}>
          <XaButton
            variant={primary ? "primary" : "secondary"}
            busy={busy}
            disabled={busy}
            onClick={() => void start()}
          >
            Start your plan
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

/** An unconfigured sale never renders a checkout control or an invented price. */
export function WorkspacePlanUnavailable({
  workspaceId,
}: {
  workspaceId: string;
}) {
  return (
    <section className={styles.section} aria-label="Your plan">
      <p className={styles.body}>
        No plan price is published yet. Self-serve plans are not available yet.{" "}
        <XaTextLink
          href={`/workspace?view=help&workspaceId=${encodeURIComponent(workspaceId)}`}
        >
          Bring in an agency
        </XaTextLink>
      </p>
    </section>
  );
}
