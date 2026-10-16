import { formatMoney } from "@/platform/connect/money-format";
import {
  XaHeadline,
  XaLabel,
  XaRow,
  XaRows,
  XaSays,
  XaStatus,
} from "@/components/ui/strelva/Xa";
import styles from "@/experience/workspace/money/money.module.css";
import MerchantControls from "./MerchantControls";
import RefundManager from "./RefundManager";
import PaymentManager, {
  type IssuedRequest,
  type PaymentSource,
} from "./PaymentManager";

export interface BusinessMoneyView {
  account: { state: string } | null;
  payments: Array<{
    id: string;
    amount_cents: number;
    currency: string;
    purpose: string;
    /** The payment request this payment answers (read_business_money returns the whole row). */
    reference_id?: string | null;
    created_at?: string;
  }>;
  events: Array<{
    payment_id: string;
    kind: string;
    amount_cents: number;
    created_at?: string;
  }>;
}

const PURPOSE_WORDS: Record<string, string> = {
  deposit: "Booking deposit",
  quote: "Quoted work",
  agent: "Quoted work",
  checkout: "Checkout",
  pay_link: "Payment link",
  agency_rebill: "Agency plan",
};
const purpose = (value: string) => PURPOSE_WORDS[value] ?? "Customer payment";
const shortDay = (iso: string | null | undefined) => {
  const value = iso ? new Date(iso) : null;
  return value && Number.isFinite(value.getTime())
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
      }).format(value)
    : "";
};

/** Payments from customers for one business (XA · R1 column): its Stripe account, what customers paid, and asking for the next payment. */
export function PaymentsScreen({
  workspaceId,
  money,
  sources,
  requests,
}: {
  workspaceId: string;
  money: BusinessMoneyView | null;
  sources: PaymentSource[];
  requests: IssuedRequest[];
}) {
  const state = money?.account?.state ?? "pending";
  const paidIds = new Set(
    (money?.events ?? [])
      .filter((e) => e.kind === "paid")
      .map((e) => e.payment_id),
  );
  const refunded = (id: string) =>
    (money?.events ?? [])
      .filter((e) => e.payment_id === id && e.kind === "refund")
      .reduce((sum, e) => sum + e.amount_cents, 0);
  const payments = money?.payments ?? [];
  const settled = payments.filter((p) => paidIds.has(p.id));
  const total = settled.reduce(
    (sum, p) => sum + p.amount_cents - refunded(p.id),
    0,
  );
  const currency = settled[0]?.currency ?? "usd";
  // Name each payment the way its request named it ("Ana R. cleaning
  // deposit"), and date it by the day Stripe confirmed it.
  const requestFor = new Map(requests.map((item) => [item.id, item]));
  const title = (p: BusinessMoneyView["payments"][number]) =>
    (p.reference_id
      ? requestFor.get(p.reference_id)?.lines?.[0]?.name?.trim()
      : "") || purpose(p.purpose);
  // One state per payment: a request the customer already paid is listed once,
  // under Customer payments, even while Stripe hasn't confirmed it.
  const answered = new Set(
    payments.map((p) => p.reference_id).filter((id): id is string => Boolean(id)),
  );
  const waitingRequests = requests.filter(
    (item) => !answered.has(item.id) || item.refundRequired,
  );
  const unconfirmed = payments.filter((p) => !paidIds.has(p.id));
  const paidOn = (id: string) =>
    shortDay(
      (money?.events ?? []).find(
        (e) => e.payment_id === id && e.kind === "paid",
      )?.created_at,
    );
  return (
    <div className={styles.screen}>
      <div className={styles.brief}>
        <XaHeadline quiet="Money goes straight to your bank through Stripe. Strelva never holds it.">
          {settled.length
            ? `Customers paid ${formatMoney(total, currency)} through Strelva.`
            : "No customer has paid through Strelva yet."}
        </XaHeadline>
      </div>
      <MerchantControls
        key={`merchant:${workspaceId}`}
        workspaceId={workspaceId}
        state={state}
      />
      <section
        className={styles.section}
        aria-labelledby="customer-payments-heading"
      >
        <XaLabel as="h2" id="customer-payments-heading">
          Customer payments
        </XaLabel>
        {payments.length ? (
          <XaRows label="Customer payments">
            {payments.map((p) => {
              const back = refunded(p.id);
              return (
                <XaRow
                  key={p.id}
                  title={title(p)}
                  detail={
                    !paidIds.has(p.id) ? (
                      <XaStatus kind="waits" size="sm">
                        Stripe hasn’t confirmed it yet
                      </XaStatus>
                    ) : (
                      [
                        title(p) !== purpose(p.purpose)
                          ? purpose(p.purpose)
                          : "",
                        paidOn(p.id) ? `paid ${paidOn(p.id)}` : "",
                        back ? `${formatMoney(back, p.currency)} refunded` : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")
                        .replace(/^paid/, "Paid") || undefined
                    )
                  }
                  meta={
                    <span className={styles.figure}>
                      {formatMoney(p.amount_cents, p.currency)}
                    </span>
                  }
                />
              );
            })}
          </XaRows>
        ) : (
          <p className={styles.body}>
            Payments show up here as Stripe confirms them.
          </p>
        )}
        {/* Bad news keeps Pebble in frame, with the next step named. */}
        {unconfirmed.length ? (
          <XaSays>
            {unconfirmed.length === 1
              ? `Stripe hasn’t confirmed ${title(unconfirmed[0]!)} yet.`
              : `Stripe hasn’t confirmed ${unconfirmed.length} payments yet.`}{" "}
            Strelva checks again on its own and marks it paid once Stripe
            does. Nothing is asked of you or the customer.
          </XaSays>
        ) : null}
        <RefundManager
          key={`refund:${workspaceId}`}
          workspaceId={workspaceId}
          payments={settled
            .map((p) => ({
              id: p.id,
              currency: p.currency,
              label: title(p),
              remainingCents: p.amount_cents - refunded(p.id),
            }))
            .filter((p) => p.remainingCents > 0)}
        />
      </section>
      <PaymentManager
        key={workspaceId}
        workspaceId={workspaceId}
        sources={sources}
        requests={waitingRequests}
        primary={state === "ready"}
      />
    </div>
  );
}
