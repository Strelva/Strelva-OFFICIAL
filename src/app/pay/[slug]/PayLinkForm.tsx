"use client";

import { FormEvent, useState } from "react";
import { Lock } from "lucide-react";
import { formatWholeDollarsUsd } from "@/lib/currency";
import { formatMoney } from "@/platform/connect/money-format";
import { payLinkReassurance } from "@/lib/pay-link-copy";
import { XaButton, XaField, XaSegmented } from "@/components/ui/strelva/Xa";
import styles from "@/experience/workspace/money/money.module.css";

const STEP_DOLLARS = 50;
const MOST_CHOICES = 6;

/** Every amount a client can pick: each $50 from low to high, ends included. */
export function amountSteps(min: number, max: number): number[] {
  if (!(max > min)) return [min];
  const all: number[] = [];
  for (let value = min; value < max; value += STEP_DOLLARS) all.push(value);
  all.push(max);
  return all;
}

export interface PayLinkFormProps {
  slug: string;
  /** Door this link sells; drives the reassurance copy under the amount. */
  door?: "build" | "managed_start";
  /** Fixed price in cents, when the link is a fixed-amount link. */
  amountCents?: number;
  /** Range bounds in cents, when the link is a slider link. */
  minCents?: number;
  maxCents?: number;
}

/** The pay panel's controls: the chosen amount on a range link, then the one pay button. Checkout itself happens on Stripe. */
export function PayLinkForm({
  slug,
  door,
  amountCents,
  minCents,
  maxCents,
}: PayLinkFormProps) {
  const isFixed = typeof amountCents === "number";
  const min = isFixed ? (amountCents as number) / 100 : (minCents ?? 0) / 100;
  const max = isFixed ? (amountCents as number) / 100 : (maxCents ?? 0) / 100;

  const [amount, setAmount] = useState(min);
  const [customerEmail, setCustomerEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const steps = isFixed ? [] : amountSteps(min, max);
  const amountCentsNow = Math.round(amount * 100);
  // Connected fixed links may carry cents; whole-dollar output stays as it was.
  const hasCents = amountCentsNow % 100 !== 0;
  const amountLabel = hasCents
    ? formatMoney(amountCentsNow, "usd")
    : formatWholeDollarsUsd(amountCentsNow);
  const reassurance = door
    ? payLinkReassurance({ door, amountCents, minCents, maxCents })
    : null;

  async function startCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The form is noValidate: a mistyped email is said in a sentence, never a browser bubble.
    const email = customerEmail.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("That email address looks incomplete. Fix it, or leave it blank.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/pay/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: String(amount),
          customerEmail: customerEmail.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.checkoutUrl) {
        setError(data.error || "Stripe couldn't be opened. Nothing was charged.");
        return;
      }
      window.location.href = data.checkoutUrl;
    } catch {
      setError(
        "Stripe couldn't be opened. Check your connection and try again; nothing was charged.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={startCheckout}
      noValidate
      autoComplete="off"
      className={styles.section}
      aria-label="Pay this link"
    >
      {!isFixed ? (
        <>
          <p className={styles.amount} aria-live="polite">
            {amountLabel}
          </p>
          {/* A choice of amounts in the charging agency's color, not a raw browser slider. */}
          {steps.length <= MOST_CHOICES ? (
            <XaSegmented
              label="Payment amount"
              tone="action"
              block
              value={String(amount)}
              onChange={(value) => setAmount(Number(value))}
              options={steps.map((dollars) => ({
                value: String(dollars),
                label: formatWholeDollarsUsd(Math.round(dollars * 100)),
              }))}
            />
          ) : (
            // Many steps: less and more, $50 at a time, so every amount stays reachable.
            <div className={styles.actions} role="group" aria-label="Payment amount">
              <XaButton
                size="sm"
                disabled={amount <= min}
                onClick={() => setAmount(Math.max(min, amount - STEP_DOLLARS))}
                aria-label={`$${STEP_DOLLARS} less`}
              >
                Less
              </XaButton>
              <XaButton
                size="sm"
                disabled={amount >= max}
                onClick={() => setAmount(Math.min(max, amount + STEP_DOLLARS))}
                aria-label={`$${STEP_DOLLARS} more`}
              >
                More
              </XaButton>
              <span className={styles.note}>
                {formatWholeDollarsUsd(Math.round(min * 100))} to{" "}
                {formatWholeDollarsUsd(Math.round(max * 100))}
              </span>
            </div>
          )}
        </>
      ) : null}
      {reassurance ? <p className={styles.note}>{reassurance}</p> : null}
      {/* Email: legacy links only. Receipts for agency links come from the agency's own Stripe settings. */}
      {door ? (
        <XaField
          label="Email for your receipt"
          type="email"
          value={customerEmail}
          onChange={(event) => setCustomerEmail(event.target.value)}
          placeholder="you@example.com"
        />
      ) : null}
      {error ? (
        <p className={styles.critical} role="alert">
          {error}
        </p>
      ) : null}
      <XaButton type="submit" variant="primary" size="lg" block busy={loading}>
        {loading ? "Opening Stripe" : `Pay ${amountLabel}`}
      </XaButton>
      <p className={`${styles.panelFoot} ${styles.secure}`}>
        <Lock size={12} aria-hidden="true" />
        You enter your card on Stripe, not here.
      </p>
    </form>
  );
}
