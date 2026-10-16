import { XaInitial, XaTextLink } from "@/components/ui/strelva/Xa";
import { describeMoneyDocument } from "@/platform/agency-pay-links/document";
import type { MoneyDocument as MoneyDocumentRecord } from "@/platform/agency-pay-links/types";
import { PrintDocumentButton } from "./PrintDocumentButton";
import { DOCUMENT_PRINT_CSS } from "./print";
import styles from "@/experience/workspace/money/money.module.css";

/**
 * An Invoice or Payment receipt as one white sheet: the page's one raised
 * object. Plain lines inside, the amount as the largest figure. It is never
 * emailed by Strelva; it prints or saves as a PDF.
 */
export function MoneyDocument({
  doc,
  back,
  payUrl,
}: {
  doc: MoneyDocumentRecord;
  back?: { label: string; href: string };
  payUrl?: string;
}) {
  const view = describeMoneyDocument(doc);
  const issuer = view.issuerName || "Issuer not recorded";
  const [amount, ...rest] = view.rows;
  const headline = amount && /^Amount/.test(amount.label) ? amount : null;
  const lines = headline ? rest : view.rows;
  return (
    <div className={styles.docFrame}>
      <style>{DOCUMENT_PRINT_CSS}</style>
      {back ? (
        <p className={styles.note} data-print-hide>
          <XaTextLink href={back.href}>{back.label}</XaTextLink>
        </p>
      ) : null}
      <article className={styles.doc} aria-labelledby={`doc-${doc.id}`}>
        <header className={styles.docTop}>
          <span className={styles.docIssuer}>
            <XaInitial name={issuer} size={32} />
            {issuer}
          </span>
          <p className={styles.docKind} id={`doc-${doc.id}`}>
            {view.title}
            <strong>{view.numberLabel}</strong>
          </p>
        </header>
        {headline ? (
          <div className={styles.section}>
            <p className={styles.note}>{headline.label}</p>
            <p className={styles.amount}>{headline.value}</p>
          </div>
        ) : null}
        <dl className={styles.docLines}>
          <div className={styles.docLine}>
            <dt>Billed to</dt>
            <dd>{view.billTo || "Not recorded"}</dd>
          </div>
          <div className={styles.docLine}>
            <dt>For</dt>
            <dd>{view.description || "Not recorded"}</dd>
          </div>
          {lines.map((row) => (
            <div key={row.label} className={styles.docLine}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
          {payUrl ? (
            <div className={styles.docLine}>
              <dt>Pay at</dt>
              <dd>
                <a href={payUrl} className={styles.detailsToggle}>
                  {payUrl}
                </a>
              </dd>
            </div>
          ) : null}
        </dl>
        <p className={styles.note}>
          Payments go to {view.issuerName || "the issuer"}&apos;s Stripe
          account. Strelva never holds the money.
        </p>
      </article>
      <div className={styles.actions} data-print-hide>
        <PrintDocumentButton />
        <p className={styles.note}>
          Not emailed. Strelva does not send invoices or payment receipts yet.
          Share the link or print this page.
        </p>
      </div>
    </div>
  );
}
