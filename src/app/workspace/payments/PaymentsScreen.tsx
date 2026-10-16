import { formatMoney } from "@/platform/connect/money-format";
import { XaHeadline, XaLabel, XaRow, XaRows, XaStatus } from "@/components/ui/strelva/Xa";
import styles from "@/experience/workspace/money/money.module.css";
import MerchantControls from "./MerchantControls";
import RefundManager from "./RefundManager";
import PaymentManager, { type IssuedRequest, type PaymentSource } from "./PaymentManager";

export interface BusinessMoneyView {
  account: { state: string } | null;
  payments: Array<{ id: string; amount_cents: number; currency: string; purpose: string }>;
  events: Array<{ payment_id: string; kind: string; amount_cents: number }>;
}

const purpose = (value: string) => { const words = value.replaceAll("_", " ").trim(); return words ? words[0]!.toUpperCase() + words.slice(1) : "Customer payment"; };

/** Deposits and payments for one business (XA · R1 column): its Stripe account, what customers paid, and asking for the next payment. */
export function PaymentsScreen({ workspaceId, money, sources, requests }: { workspaceId: string; money: BusinessMoneyView | null; sources: PaymentSource[]; requests: IssuedRequest[] }) {
  const state = money?.account?.state ?? "pending";
  const paidIds = new Set((money?.events ?? []).filter(e => e.kind === "paid").map(e => e.payment_id));
  const refunded = (id: string) => (money?.events ?? []).filter(e => e.payment_id === id && e.kind === "refund").reduce((sum, e) => sum + e.amount_cents, 0);
  const payments = money?.payments ?? [];
  const settled = payments.filter(p => paidIds.has(p.id));
  const total = settled.reduce((sum, p) => sum + p.amount_cents - refunded(p.id), 0);
  const currency = settled[0]?.currency ?? "usd";
  return <div className={styles.screen}>
    <div className={styles.brief}>
      <XaHeadline quiet="Money goes straight to your bank through Stripe. Strelva never holds it.">
        {settled.length ? `Customers paid ${formatMoney(total, currency)} through Strelva.` : "Take deposits and payments."}
      </XaHeadline>
    </div>
    <MerchantControls key={`merchant:${workspaceId}`} workspaceId={workspaceId} state={state} />
    <section className={styles.section} aria-labelledby="customer-payments-heading">
      <XaLabel as="h2" id="customer-payments-heading">Customer payments</XaLabel>
      {payments.length ? <XaRows label="Customer payments">{payments.map(p => {
        const back = refunded(p.id);
        return <XaRow key={p.id} title={purpose(p.purpose)} detail={!paidIds.has(p.id) ? <XaStatus kind="waits" size="sm">Not confirmed by Stripe yet</XaStatus> : back ? `${formatMoney(back, p.currency)} refunded` : undefined} meta={<span className={styles.figure}>{formatMoney(p.amount_cents, p.currency)}</span>} />;
      })}</XaRows> : <p className={styles.body}>No customer payments yet. They appear here as Stripe confirms them.</p>}
      <RefundManager key={`refund:${workspaceId}`} workspaceId={workspaceId} payments={settled.map(p => ({ id: p.id, currency: p.currency, label: purpose(p.purpose), remainingCents: p.amount_cents - refunded(p.id) })).filter(p => p.remainingCents > 0)} />
    </section>
    <PaymentManager key={workspaceId} workspaceId={workspaceId} sources={sources} requests={requests} primary={state === "ready"} />
  </div>;
}
