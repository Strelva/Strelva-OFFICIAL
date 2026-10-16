"use client";

import { FormEvent, useState } from "react";
import { Lock } from "lucide-react";
import { formatWholeDollarsUsd } from "@/lib/currency";
import { formatMoney } from "@/platform/connect/money-format";
import { payLinkReassurance } from "@/lib/pay-link-copy";
import { XaButton, XaField } from "@/components/ui/strelva/Xa";
import styles from "@/experience/workspace/money/money.module.css";

const STEP_DOLLARS = 50;

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
        setError(data.error || "Could not open secure checkout.");
        return;
      }
      window.location.href = data.checkoutUrl;
    } catch {
      setError(
        "Could not open secure checkout. Check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={startCheckout}
      autoComplete="off"
      className={styles.section}
      aria-label="Pay this link"
    >
      {!isFixed ? (
        <>
          <p className={styles.amount} aria-live="polite">
            {amountLabel}
          </p>
          <input
            type="range"
            min={min}
            max={max}
            step={STEP_DOLLARS}
            value={amount}
            onChange={(event) => setAmount(Number(event.target.value))}
            aria-label="Payment amount"
            aria-valuetext={amountLabel}
            className={styles.range}
          />
          <div className={styles.rangeEnds} aria-hidden="true">
            <span>{formatWholeDollarsUsd(Math.round(min * 100))}</span>
            <span>{formatWholeDollarsUsd(Math.round(max * 100))}</span>
          </div>
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
        {loading ? "Opening secure checkout" : `Pay ${amountLabel}`}
      </XaButton>
      <p className={`${styles.panelFoot} ${styles.secure}`}>
        <Lock size={12} aria-hidden="true" />
        Card details are entered on Stripe&apos;s secure checkout.
      </p>
    </form>
  );
}
