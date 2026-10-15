import { formatMoney } from "@/platform/connect/money-format";
import { formatDocumentNumber, type MoneyDocument } from "./types";

export interface MoneyDocumentView {
  title: "Invoice" | "Payment receipt";
  numberLabel: string;
  issuerName: string;
  billTo: string;
  description: string;
  rows: Array<{ label: string; value: string }>;
}

const text = (value: unknown) => (typeof value === "string" ? value : "");
const cents = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const day = (value: unknown) => {
  const parsed = typeof value === "string" ? new Date(value) : null;
  return parsed && Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString("en-US", { timeZone: "UTC", year: "numeric", month: "long", day: "numeric" }) : "";
};

/**
 * Plain facts for a numbered money document, read only from its immutable snapshot.
 * Nothing about who created the link is shown.
 */
export function describeMoneyDocument(doc: MoneyDocument): MoneyDocumentView {
  const s = doc.snapshot;
  const currency = text(s.currency) || "usd";
  const rows: MoneyDocumentView["rows"] = [];
  if (doc.kind === "invoice") {
    const fixed = cents(s.amountCents);
    const low = cents(s.minCents);
    const high = cents(s.maxCents);
    rows.push({ label: "Amount", value: fixed !== null ? formatMoney(fixed, currency) : low !== null && high !== null ? `${formatMoney(low, currency)} to ${formatMoney(high, currency)}, chosen by the payer` : "" });
    rows.push({ label: "Issued", value: day(s.issuedAt) || day(doc.issued_at) });
  } else {
    const paid = cents(s.amountPaidCents);
    rows.push({ label: "Amount paid", value: paid !== null ? formatMoney(paid, currency) : "" });
    rows.push({ label: "Paid", value: day(s.paidAt) });
    rows.push({ label: "Payment reference", value: text(s.paymentReference) });
  }
  return {
    title: doc.kind === "invoice" ? "Invoice" : "Payment receipt",
    numberLabel: formatDocumentNumber(doc.kind, doc.number),
    issuerName: text(s.issuerName),
    billTo: text(s.billTo),
    description: text(s.description),
    rows: rows.filter(row => row.value),
  };
}
