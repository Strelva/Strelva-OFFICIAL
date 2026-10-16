"use client";
import { formatMoney, chargeUnits } from "@/platform/connect/money-format";
import { useRef, useState, useEffect } from "react";
import {
  XaButton,
  XaField,
  XaLabel,
  XaRow,
  XaRows,
  XaSays,
  XaSegmented,
  XaSelect,
  XaStatus,
  XaTextLink,
} from "@/components/ui/strelva/Xa";
import styles from "@/experience/workspace/money/money.module.css";

export interface PaymentSource {
  source_id: string;
  kind: "quote" | "deposit";
  label: string;
  approvedCents?: number;
  approvedCurrency?: string;
  approvedTerms?: string;
}
export interface IssuedRequest {
  id: string;
  kind: string;
  amount_cents: number;
  currency: string;
  status: string;
  refundRequired: boolean;
  /** What the owner named it ("Ana R. cleaning deposit"); the read returns the whole row. */
  lines?: { name?: string }[];
  issued_at?: string;
  expires_at?: string;
}
const shortDay = (iso: string | null | undefined) => {
  const value = iso ? new Date(iso) : null;
  return value && Number.isFinite(value.getTime())
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
      }).format(value)
    : "";
};

const KIND_WORDS: Record<string, string> = {
  quote: "Quoted work",
  deposit: "Booking deposit",
};
const STATUS: Record<
  string,
  { kind: "live" | "waits" | "draft"; word: string }
> = {
  paid: { kind: "live", word: "Paid" },
  unpaid: { kind: "waits", word: "Waiting on the customer" },
  expired: { kind: "draft", word: "Expired" },
  cancelled: { kind: "draft", word: "Cancelled" },
};

/** Ask a customer to pay for an approved quote or a held booking, then see every request. `primary` when this is the screen's one thing to do. */
export default function PaymentManager({
  workspaceId,
  sources,
  requests,
  primary = false,
}: {
  workspaceId: string;
  sources: PaymentSource[];
  requests: IssuedRequest[];
  primary?: boolean;
}) {
  const [source, setSource] = useState(sources[0]?.source_id ?? "");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("usd");
  const [name, setName] = useState("");
  const [expires, setExpires] = useState("");
  const [refundable, setRefundable] = useState<"yes" | "no">("yes");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const key = useRef<string | null>(null);
  const selected = sources.find((s) => s.source_id === source);
  useEffect(() => {
    if (selected?.approvedCents) {
      setAmount(
        (
          selected.approvedCents /
          chargeUnits(selected.approvedCurrency ?? "usd")
        ).toFixed(2),
      );
      setCurrency(selected.approvedCurrency ?? "usd");
      setName("Quoted work");
    }
  }, [selected]);
  async function issue(e: React.FormEvent) {
    e.preventDefault();
    const selected = sources.find((s) => s.source_id === source);
    if (!selected) return;
    setBusy(true);
    setError(null);
    key.current ??= crypto.randomUUID();
    try {
      const cents = Math.round(Number(amount) * chargeUnits(currency));
      if (!Number.isSafeInteger(cents) || cents <= 0)
        throw Error("Enter an amount above zero.");
      const response = await fetch("/api/workspace/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          kind: selected.kind,
          sourceRecordId: source,
          lines: [{ name, quantity: 1, unitCents: cents }],
          currency,
          expiresAt: new Date(expires).toISOString(),
          ...(selected.kind === "deposit"
            ? { cancellationPolicy: { refundable: refundable === "yes" } }
            : {}),
          idempotencyKey: key.current,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw Error(result.error ?? "The payment request could not be made.");
      if (typeof result.paymentUrl !== "string")
        throw Error(
          "The payment request could not be confirmed. Sign in and try again.",
        );
      const link = new URL(result.paymentUrl);
      if (link.origin !== location.origin || link.pathname !== "/pay/business")
        throw Error("The payment link could not be confirmed.");
      setUrl(result.paymentUrl);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The payment request could not be made.",
      );
    } finally {
      setBusy(false);
    }
  }
  const locked = busy || !!url;
  // Paid requests already appear as customer payments; list what still waits.
  const open = requests.filter((q) => q.status !== "paid" || q.refundRequired);
  return (
    <>
      <section className={styles.section} aria-labelledby="ask-to-pay-heading">
        <XaLabel as="h2" id="ask-to-pay-heading">
          Ask a customer to pay
        </XaLabel>
        {sources.length ? (
          <form onSubmit={issue} className={styles.form}>
            <XaSelect
              label="For which inquiry or held booking"
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                key.current = null;
              }}
              disabled={locked}
              options={sources.map((s) => ({
                value: s.source_id,
                label: s.label,
              }))}
            />
            <XaField
              label="What they pay for"
              required
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={locked || !!selected?.approvedCents}
            />
            <div className={styles.pair}>
              <XaField
                label="Amount"
                inputMode="decimal"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={locked || !!selected?.approvedCents}
              />
              <XaSelect
                label="Currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                disabled={locked || !!selected?.approvedCents}
                options={[
                  { value: "usd", label: "US dollars" },
                  { value: "cad", label: "Canadian dollars" },
                  { value: "eur", label: "Euros" },
                ]}
              />
            </div>
            <XaField
              label="Pay by"
              type="datetime-local"
              required
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
              disabled={locked}
            />
            {selected?.kind === "deposit" ? (
              <div className={styles.section}>
                <XaLabel>If the booking is cancelled</XaLabel>
                <XaSegmented
                  label="If the booking is cancelled"
                  value={refundable}
                  onChange={(value) => {
                    if (!locked) setRefundable(value);
                  }}
                  options={[
                    { value: "yes", label: "Refund the deposit" },
                    { value: "no", label: "Keep the deposit" },
                  ]}
                />
              </div>
            ) : null}
            {selected?.approvedTerms ? (
              <p className={styles.body}>{selected.approvedTerms}</p>
            ) : null}
            <p className={styles.note}>
              Making the link freezes the amount and terms. You send the link to
              the customer yourself.
            </p>
            <div className={styles.actions}>
              <XaButton
                variant={primary ? "primary" : "secondary"}
                type="submit"
                busy={busy}
                disabled={locked}
              >
                Make payment link
              </XaButton>
            </div>
          </form>
        ) : (
          <p className={styles.body}>
            A customer inquiry or a held booking comes first. When you approve a
            quote or hold a booking, you can ask for payment here.
          </p>
        )}
        {error ? (
          <p className={styles.critical} role="alert">
            {error}
          </p>
        ) : null}
        {url ? (
          <XaSays
            links={[
              <XaTextLink key="open" href={url}>
                Open it
              </XaTextLink>,
            ]}
          >
            Payment link made. Copy it from the address bar and send it to your
            customer.
          </XaSays>
        ) : null}
      </section>
      <section className={styles.section} aria-labelledby="requests-heading">
        <XaLabel as="h2" id="requests-heading">
          Payment requests
        </XaLabel>
        {open.length ? (
          <XaRows label="Payment requests">
            {open.map((q) => {
              const status = STATUS[q.status] ?? {
                kind: "draft" as const,
                word: q.status.replaceAll("_", " "),
              };
              return (
                <XaRow
                  key={q.id}
                  title={
                    q.lines?.[0]?.name?.trim() ||
                    KIND_WORDS[q.kind] ||
                    q.kind.replaceAll("_", " ")
                  }
                  detail={
                    <>
                      {q.refundRequired ? (
                        <XaStatus kind="waits" size="sm">
                          Refund needs your review
                        </XaStatus>
                      ) : status.kind === "live" ? null : (
                        <XaStatus kind={status.kind} size="sm">
                          {status.word}
                        </XaStatus>
                      )}
                      {q.issued_at && shortDay(q.issued_at)
                        ? ` · sent ${shortDay(q.issued_at)}`
                        : ""}
                      {q.status === "unpaid" && shortDay(q.expires_at)
                        ? `, pay by ${shortDay(q.expires_at)}`
                        : ""}
                    </>
                  }
                  meta={
                    <span className={styles.figure}>
                      {formatMoney(q.amount_cents, q.currency)}
                    </span>
                  }
                />
              );
            })}
          </XaRows>
        ) : (
          <p className={styles.body}>
            {requests.length
              ? "Every payment request is paid. Paid ones are listed under Customer payments."
              : "No payment requests yet."}
          </p>
        )}
      </section>
    </>
  );
}
