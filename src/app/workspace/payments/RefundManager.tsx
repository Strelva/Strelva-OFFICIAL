"use client";
import { formatMoney, chargeUnits } from "@/platform/connect/money-format";
import { useRef, useState } from "react";
import {
  XaButton,
  XaField,
  XaSays,
  XaSelect,
} from "@/components/ui/strelva/Xa";
import styles from "@/experience/workspace/money/money.module.css";

export interface RefundPayment {
  id: string;
  currency: string;
  remainingCents: number;
  label?: string;
}

/** Refund part or all of a settled customer payment, inline. Stripe reports the final status. */
export default function RefundManager({
  workspaceId,
  payments,
}: {
  workspaceId: string;
  payments: RefundPayment[];
}) {
  const [id, setId] = useState(payments[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const key = useRef<string | null>(null);
  async function refund(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    key.current ??= crypto.randomUUID();
    try {
      const amountCents = Math.round(
        Number(amount) *
          chargeUnits(payments.find((p) => p.id === id)?.currency ?? "usd"),
      );
      if (!Number.isSafeInteger(amountCents) || amountCents <= 0)
        throw Error("Enter a refund amount above zero.");
      const response = await fetch("/api/workspace/payments/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          paymentId: id,
          amountCents,
          idempotencyKey: key.current,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw Error(result.error ?? "The refund could not be requested.");
      if (
        typeof result.refundId !== "string" ||
        !/^re_[A-Za-z0-9]+$/.test(result.refundId)
      )
        throw Error(
          "The refund could not be confirmed. Sign in and try again.",
        );
      setMessage(
        `Refund requested. Stripe says it is ${String(result.status ?? "pending").replaceAll("_", " ")}; its final status comes from Stripe.`,
      );
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "The refund could not be requested.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!payments.length) return null;
  return (
    <details className={styles.history}>
      <summary className={styles.detailsToggle}>
        Refund a customer payment
      </summary>
      <form
        onSubmit={refund}
        className={`${styles.form} ${styles.inlinePanel}`}
        aria-label="Refund a customer payment"
      >
        <XaSelect
          label="Payment"
          value={id}
          onChange={(e) => {
            setId(e.target.value);
            key.current = null;
          }}
          disabled={busy}
          options={payments.map((p) => ({
            value: p.id,
            label: `${p.label ? `${p.label} · ` : ""}${formatMoney(p.remainingCents, p.currency)} left to refund`,
          }))}
        />
        <XaField
          label="Refund amount"
          inputMode="decimal"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={busy}
        />
        <p className={styles.note}>
          The refund goes back to the original card. Stripe&apos;s fees and your
          cancellation terms apply.
        </p>
        <div className={styles.actions}>
          <XaButton type="submit" busy={busy} disabled={busy}>
            Request refund
          </XaButton>
        </div>
        {message ? <XaSays>{message}</XaSays> : null}
      </form>
    </details>
  );
}
