import { XaTextLink } from "@/components/ui/strelva/Xa";
import { describeMoneyDocument } from "@/platform/agency-pay-links/document";
import type { MoneyDocument as MoneyDocumentRecord } from "@/platform/agency-pay-links/types";
import { PrintDocumentButton } from "@/experience/workspace/billing/PrintDocumentButton";
import { DOCUMENT_PRINT_CSS } from "@/experience/workspace/billing/print";
import styles from "@/experience/workspace/money/money.module.css";

/**
 * What the payer sees once their payment is confirmed (/pay/[slug]/receipt):
 * one sentence of what happened, said in the charging business's words, not a
 * receipt form. One quiet "Reference 4418" line (the number a payer quotes to
 * the business: Stripe's short payment number, else the receipt number), and the page still prints or saves as a PDF. Strelva speaks
 * only in the page's footer credit.
 */
export function PaidNote({ doc, back }: { doc: MoneyDocumentRecord; back?: { label: string; href: string } }) {
  const view = describeMoneyDocument(doc);
  const issuer = view.issuerName || "the business";
  const row = (label: string) => view.rows.find(item => item.label === label)?.value;
  const amount = row("Amount paid");
  const paid = row("Paid");
  // A raw id is not a reference a payer can use: only the short number they can quote.
  const reference = row("Payment reference");
  const quoted = reference && !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(reference) ? reference.match(/([A-Za-z0-9]{3,12})\s*$/)?.[1] ?? null : null;
  const forWhat = view.description ? view.description.charAt(0).toLowerCase() + view.description.slice(1) : null;
  return <>
    <style>{DOCUMENT_PRINT_CSS}</style>
    <h1 className={styles.publicTitle}>You paid {issuer}{amount ? ` ${amount}` : ""}</h1>
    <p className={styles.publicCopy}>
      {paid ? `On ${paid}` : "Stripe confirmed it"}{view.billTo ? `, for ${view.billTo}` : ""}{forWhat ? `: ${forWhat}` : ""}.
      {" "}Questions about it go to {issuer}.
    </p>
    {quoted || view.numberLabel ? <p className={styles.note}>Reference {quoted ?? view.numberLabel}</p> : null}
    <div className={styles.actions} data-print-hide>
      <PrintDocumentButton link />
      {back ? <XaTextLink href={back.href}>{back.label}</XaTextLink> : null}
    </div>
    <p className={styles.note} data-print-hide>This page is your record; nothing is emailed. Keep the link or print it.</p>
  </>;
}
