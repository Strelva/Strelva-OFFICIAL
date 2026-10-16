import { XaTextLink } from "@/components/ui/strelva/Xa";
import { describeMoneyDocument } from "@/platform/agency-pay-links/document";
import type { MoneyDocument as MoneyDocumentRecord } from "@/platform/agency-pay-links/types";
import { PrintDocumentButton } from "@/experience/workspace/billing/PrintDocumentButton";
import { DOCUMENT_PRINT_CSS } from "@/experience/workspace/billing/print";
import styles from "@/experience/workspace/money/money.module.css";

/**
 * What the payer sees once their payment is confirmed (/pay/[slug]/receipt):
 * one sentence of what happened, said in the charging business's words, not a
 * receipt form. The reference a payer may need sits in one quiet line, and the
 * page still prints or saves as a PDF for their records.
 */
export function PaidNote({ doc, back }: { doc: MoneyDocumentRecord; back?: { label: string; href: string } }) {
  const view = describeMoneyDocument(doc);
  const issuer = view.issuerName || "the business";
  const row = (label: string) => view.rows.find(item => item.label === label)?.value;
  const amount = row("Amount paid");
  const paid = row("Paid");
  // A raw id is not a reference a payer can use; Stripe's own wording is.
  const reference = row("Payment reference");
  const readable = reference && !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(reference) ? reference : null;
  const forWhat = view.description ? view.description.charAt(0).toLowerCase() + view.description.slice(1) : null;
  return <>
    <style>{DOCUMENT_PRINT_CSS}</style>
    <h1 className={styles.publicTitle}>You paid {issuer}{amount ? ` ${amount}` : ""}</h1>
    <p className={styles.publicCopy}>
      {paid ? `On ${paid}` : "Stripe confirmed it"}{view.billTo ? `, for ${view.billTo}` : ""}{forWhat ? `: ${forWhat}` : ""}.
      {" "}Questions about it go to {issuer}.
    </p>
    <p className={styles.note}>{[view.numberLabel ? `Receipt ${view.numberLabel}` : null, readable].filter(Boolean).join(" · ")}</p>
    <p className={styles.note}>The money went to {issuer}&apos;s own Stripe account. Strelva never holds it.</p>
    <div className={styles.actions} data-print-hide>
      <PrintDocumentButton />
      {back ? <XaTextLink href={back.href}>{back.label}</XaTextLink> : null}
    </div>
    <p className={styles.note} data-print-hide>Not emailed. Keep this link, or print the page for your records.</p>
  </>;
}
