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
              This payment link has expired. Ask {brand.name} for a new link.
              Payments already started in Stripe may still complete.
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
              Stripe confirmed this payment. Your payment receipt is numbered
              and ready to print.
            </p>
            <XaTextLink href={`/pay/${link.slug}/receipt`}>
              View payment receipt
            </XaTextLink>
          </>
        ) : (
          <>
            <p className={styles.note}>
              {link.amountCents !== null
                ? "Amount"
                : "Choose an amount, in $50 steps"}
            </p>
            {link.amountCents !== null ? (
              <p className={styles.amount}>{amount}</p>
            ) : null}
            {payment === "success" ? (
              <p className={styles.body} role="status">
                Stripe accepted your payment. It shows as paid here once Stripe
                confirms it. Refresh in a minute.
              </p>
            ) : null}
            {payment === "cancelled" ? (
              <p className={styles.body} role="status">
                No charge made. You can try again below.
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
