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
  const [amountError, setAmountError] = useState<string | undefined>();
  const key = useRef<string | null>(null);
  async function refund(e: React.FormEvent) {
    e.preventDefault();
    const amountCents = Math.round(
      Number(amount.trim().replace(/^\$/, "").replace(/,/g, "")) *
        chargeUnits(payments.find((p) => p.id === id)?.currency ?? "usd"),
    );
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
      setAmountError("Write how much to give back, like 50 or 50.25.");
      return;
    }
    setAmountError(undefined);
    setBusy(true);
    setMessage(null);
    key.current ??= crypto.randomUUID();
    try {
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
        throw Error(result.error ?? "The refund didn't go through. Nothing was sent back.");
      if (
        typeof result.refundId !== "string" ||
        !/^re_[A-Za-z0-9]+$/.test(result.refundId)
      )
        throw Error(
          "Strelva couldn't confirm the refund. Sign in and check Stripe before trying again.",
        );
      setMessage(
        result.status === "succeeded"
          ? "Stripe sent the money back to the customer's card."
          : "Stripe is sending the money back. It shows as refunded once Stripe finishes.",
      );
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "The refund didn't go through. Nothing was sent back.",
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
        noValidate
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
          label="How much to give back"
          inputMode="decimal"
          value={amount}
          error={amountError}
          onChange={(e) => {
            setAmount(e.target.value);
            setAmountError(undefined);
          }}
          disabled={busy}
        />
        <p className={styles.note}>
          The refund goes back to the original card. Stripe&apos;s fees and your
          cancellation terms apply.
        </p>
        <div className={styles.actions}>
          <XaButton type="submit" busy={busy} disabled={busy}>
            Refund it
          </XaButton>
        </div>
        {message ? <XaSays>{message}</XaSays> : null}
      </form>
    </details>
  );
}
