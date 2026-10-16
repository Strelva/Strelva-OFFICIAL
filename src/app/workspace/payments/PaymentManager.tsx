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

/** How long the customer has to pay: a choice, never a raw date-and-time picker. */
const WITHIN = [
  { value: "3", label: "3 days" },
  { value: "7", label: "A week" },
  { value: "14", label: "Two weeks" },
  { value: "30", label: "A month" },
] as const;
type Within = (typeof WITHIN)[number]["value"];
/** The end of the local day, `days` from now. */
function payBy(days: number, now = new Date()) {
  const end = new Date(now);
  end.setDate(end.getDate() + days);
  end.setHours(23, 59, 0, 0);
  return end;
}

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
  expired: { kind: "draft", word: "Ran out" },
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
  const [within, setWithin] = useState<Within>("7");
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    amount?: string;
  }>({});
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
    const cents = Math.round(
      Number(amount.trim().replace(/^\$/, "").replace(/,/g, "")) *
        chargeUnits(currency),
    );
    const problems = {
      name: name.trim() ? undefined : "Say what the customer pays for.",
      amount:
        Number.isSafeInteger(cents) && cents > 0
          ? undefined
          : "Write an amount above zero, like 120 or 120.50.",
    };
    setFieldErrors(problems);
    if (problems.name || problems.amount) return;
    setBusy(true);
    setError(null);
    key.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/workspace/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          kind: selected.kind,
          sourceRecordId: source,
          lines: [{ name: name.trim(), quantity: 1, unitCents: cents }],
          currency,
          expiresAt: payBy(Number(within)).toISOString(),
          ...(selected.kind === "deposit"
            ? { cancellationPolicy: { refundable: refundable === "yes" } }
            : {}),
          idempotencyKey: key.current,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw Error(result.error ?? "The link wasn't made. Nothing changed.");
      if (typeof result.paymentUrl !== "string")
        throw Error(
          "Strelva couldn't confirm the link. Sign in and try again.",
        );
      const link = new URL(result.paymentUrl);
      if (link.origin !== location.origin || link.pathname !== "/pay/business")
        throw Error("Strelva couldn't confirm the link. Try again.");
      setUrl(result.paymentUrl);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The link wasn't made. Nothing changed.",
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
          <form onSubmit={issue} className={styles.form} noValidate>
            <XaSelect
              label="For which inquiry or booking"
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
              maxLength={200}
              value={name}
              error={fieldErrors.name}
              onChange={(e) => {
                setName(e.target.value);
                setFieldErrors((current) => ({ ...current, name: undefined }));
              }}
              disabled={locked || !!selected?.approvedCents}
            />
            <div className={styles.pair}>
              <XaField
                label="Amount"
                inputMode="decimal"
                value={amount}
                error={fieldErrors.amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setFieldErrors((current) => ({
                    ...current,
                    amount: undefined,
                  }));
                }}
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
            <div className={styles.section}>
              <XaLabel>They have this long to pay</XaLabel>
              <XaSegmented
                label="They have this long to pay"
                value={within}
                onChange={(value) => {
                  if (!locked) setWithin(value);
                }}
                options={WITHIN}
              />
              <p className={styles.note}>
                The link works until the end of{" "}
                {new Intl.DateTimeFormat("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                }).format(payBy(Number(within)))}
                .
              </p>
            </div>
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
              Once the link is made, its amount and terms can&apos;t change. You
              send it to the customer yourself.
            </p>
            <div className={styles.actions}>
              <XaButton
                variant={primary ? "primary" : "secondary"}
                type="submit"
                busy={busy}
                disabled={locked}
              >
                Make the link
              </XaButton>
            </div>
          </form>
        ) : (
          <p className={styles.body}>
            Payments start from an inquiry or a booking. Once you agree a quote
            or hold a booking, you can ask for payment here.
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
            The link is ready. Open it, copy the address and send it to your
            customer.
          </XaSays>
        ) : null}
      </section>
      <section className={styles.section} aria-labelledby="requests-heading">
        <XaLabel as="h2" id="requests-heading">
          Waiting to be paid
        </XaLabel>
        {open.length ? (
          <XaRows label="Waiting to be paid">
            {open.map((q) => {
              const status = STATUS[q.status] ?? {
                kind: "draft" as const,
                word: "Stripe hasn't confirmed this yet",
              };
              return (
                <XaRow
                  key={q.id}
                  title={
                    q.lines?.[0]?.name?.trim() ||
                    KIND_WORDS[q.kind] ||
                    "Customer payment"
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
              ? "Everything you asked for is paid. It's listed under Customer payments."
              : "Nothing is waiting to be paid."}
          </p>
        )}
      </section>
    </>
  );
}
