import { XaTextLink } from "@/components/ui/strelva/Xa";
import { describeMoneyDocument } from "@/platform/agency-pay-links/document";
import type { MoneyDocument as MoneyDocumentRecord } from "@/platform/agency-pay-links/types";
import { formatMoney } from "@/platform/connect/money-format";
import { PrintDocumentButton } from "./PrintDocumentButton";
import { DOCUMENT_PRINT_CSS } from "./print";
import styles from "@/experience/workspace/money/money.module.css";

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const cents = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const day = (value: unknown) => {
  const parsed = typeof value === "string" ? new Date(value) : null;
  return parsed && Number.isFinite(parsed.getTime())
    ? parsed.toLocaleDateString("en-US", {
        timeZone: "UTC",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";
};
/** "Website care for November: booking page…" reads inside a sentence as "website care for November: booking page…". */
const inSentence = (value: string) =>
  value ? `${value.charAt(0).toLowerCase()}${value.slice(1)}`.replace(/\.$/, "") : "";

/**
 * An Invoice or Payment receipt as a calm letter, not a receipt form
 * (October 16): who it's from, one sentence that says what is owed or paid,
 * then where to pay and who holds the money. The document number stays
 * quiet beside the date so the client can quote it. Strelva never emails it;
 * it prints or saves as a PDF.
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
  const s = doc.snapshot as Record<string, unknown>;
  const currency = text(s.currency) || "usd";
  const issuer = view.issuerName || "Your agency";
  const billTo = view.billTo || "The client";
  const what = inSentence(view.description);
  const invoice = doc.kind === "invoice";
  const fixed = cents(s.amountCents);
  const low = cents(s.minCents);
  const high = cents(s.maxCents);
  const paid = cents(s.amountPaidCents);
  const issued = day(s.issuedAt) || day(doc.issued_at);
  const paidOn = day(s.paidAt);
  const reference = text(s.paymentReference);
  const amount = invoice
    ? fixed !== null
      ? formatMoney(fixed, currency)
      : low !== null && high !== null
        ? `between ${formatMoney(low, currency)} and ${formatMoney(high, currency)}, the amount they choose`
        : null
    : paid !== null
      ? formatMoney(paid, currency)
      : null;
  const sentence = invoice
    ? `${billTo.split(",")[0]} owes ${issuer} ${amount ?? "the agreed amount"}${what ? ` for ${what}` : ""}.`
    : `${billTo.split(",")[0]} paid ${issuer} ${amount ?? "the agreed amount"}${paidOn ? ` on ${paidOn}` : ""}${what ? `, for ${what}` : ""}.`;
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
          <span className={styles.docIssuer}>{issuer}</span>
          <p className={styles.docKind}>
            {view.title} {view.numberLabel}
            {invoice && issued ? ` · ${issued}` : ""}
          </p>
        </header>
        <h1 className={styles.docSentence} id={`doc-${doc.id}`}>
          {sentence}
        </h1>
        <div className={styles.docBody}>
          {view.billTo && view.billTo.includes(",") ? (
            <p className={styles.body}>Billed to {view.billTo}.</p>
          ) : null}
          {invoice && payUrl ? (
            <p className={styles.body}>
              Pay by card on{" "}
              <a href={payUrl} className={styles.detailsToggle}>
                {issuer}&rsquo;s payment page
              </a>
              .
            </p>
          ) : null}
          {!invoice ? (
            <p className={styles.body}>
              Thank you. Nothing more is owed for this.
            </p>
          ) : null}
        </div>
        <footer className={styles.docFoot}>
          <p className={styles.note}>
            Payments go to {issuer}&apos;s own Stripe account. Strelva never
            holds the money.
          </p>
          {reference ? (
            <p className={styles.note}>Payment reference {reference}</p>
          ) : null}
        </footer>
      </article>
      <div className={styles.actions} data-print-hide>
        <PrintDocumentButton />
        <p className={styles.note}>
          Not emailed. Strelva doesn&apos;t send invoices or receipts yet, so
          share the link or print this page.
        </p>
      </div>
    </div>
  );
}
