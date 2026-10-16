import { XaStatus, XaTextLink } from "@/components/ui/strelva/Xa";
import { formatMoney } from "@/platform/connect/money-format";
import type { OwnerBrand } from "@/platform/infra/agency-brand";
import { PublicMoneyPage } from "@/experience/workspace/money/PublicMoneyPage";
import styles from "@/experience/workspace/money/money.module.css";
import { PayLinkForm } from "./PayLinkForm";

export interface ConnectedPayLinkView {
  slug: string;
  clientName: string;
  description: string;
  amountCents: number | null;
  minCents: number | null;
  maxCents: number | null;
  currency: string;
  status: "open" | "paid" | "expired";
  receiptNumber: number | null;
}

/** A payment link that charges on the agency's own Stripe account (XA · E4 language). */
export function ConnectedPayLink({
  link,
  brand,
  payment,
}: {
  link: ConnectedPayLinkView;
  brand: OwnerBrand;
  payment?: string;
}) {
  const amount =
    link.amountCents !== null
      ? formatMoney(link.amountCents, link.currency)
      : `${formatMoney(link.minCents ?? 0, link.currency)} to ${formatMoney(link.maxCents ?? 0, link.currency)}`;
  const lead = (
    <>
      <p className={styles.publicKicker}>For {link.clientName}</p>
      <h1 className={styles.publicTitle}>Pay {brand.name}</h1>
      {link.description ? (
        <p className={styles.publicCopy}>{link.description}</p>
      ) : null}
    </>
  );
  if (link.status === "expired")
    return (
      <PublicMoneyPage
        brand={brand}
        lead={
          <>
            {lead}
            <p className={styles.body}>
              This link is stopped, so it can&apos;t take a payment. Ask{" "}
              {brand.name} for a new one. A payment already under way can still
              finish.
            </p>
          </>
        }
      />
    );
  return (
    <PublicMoneyPage
      brand={brand}
      lead={lead}
      credit={`Payments go straight to ${brand.name} through Stripe.`}
      panel={
        link.status === "paid" ? (
          <>
            <XaStatus kind="live">Paid</XaStatus>
            <p className={styles.amount}>{amount}</p>
            <p className={styles.body}>
              Stripe confirmed your payment. Thank you.
            </p>
            <XaTextLink href={`/pay/${link.slug}/receipt`}>
              See your receipt
            </XaTextLink>
          </>
        ) : (
          <>
            <p className={styles.note}>
              {link.amountCents !== null
                ? "Amount"
                : "Choose what fits, in steps of 50 dollars"}
            </p>
            {link.amountCents !== null ? (
              <p className={styles.amount}>{amount}</p>
            ) : null}
            {payment === "success" ? (
              <p className={styles.body} role="status">
                Stripe took your payment. This page says paid once Stripe
                confirms it, usually within a minute.
              </p>
            ) : null}
            {payment === "cancelled" ? (
              <p className={styles.body} role="status">
                Nothing was charged. You can pay whenever you&apos;re ready.
              </p>
            ) : null}
            <PayLinkForm
              slug={link.slug}
              amountCents={link.amountCents ?? undefined}
              minCents={link.minCents ?? undefined}
              maxCents={link.maxCents ?? undefined}
            />
          </>
        )
      }
    />
  );
}
