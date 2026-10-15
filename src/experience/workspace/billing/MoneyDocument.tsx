import { StCopy, StHead, StMono, StRow, StRows, StSection, StTextButton } from "@/components/ui/strelva/Kit";
import { describeMoneyDocument } from "@/platform/agency-pay-links/document";
import type { MoneyDocument as MoneyDocumentRecord } from "@/platform/agency-pay-links/types";
import { PrintDocumentButton } from "./PrintDocumentButton";

// Print keeps the document and drops the page header, so the saved PDF is the document alone.
const PRINT_CSS = "@media print { main > header, [data-print-hide] { display: none !important; } }";

/** An Invoice or Payment receipt as a printable page. It is never emailed by Strelva. */
export function MoneyDocument({ doc, back }: { doc: MoneyDocumentRecord; back?: { label: string; href: string } }) {
  const view = describeMoneyDocument(doc);
  return <>
    <style>{PRINT_CSS}</style>
    {back ? <div data-print-hide><StTextButton href={back.href}>{back.label}</StTextButton></div> : null}
    <StHead title={view.title} meta={view.numberLabel} />
    <StSection title={view.issuerName || "Issuer not recorded"}>
      <StRows label={view.title}>
        <StRow title="Billed to" end={<StMono tone="text">{view.billTo}</StMono>} />
        <StRow title="For" detail={view.description} />
        {view.rows.map(row => <StRow key={row.label} title={row.label} end={<StMono tone="text">{row.value}</StMono>} />)}
      </StRows>
    </StSection>
    <StCopy muted>Not emailed. Strelva does not send this document. Print it or save it as a PDF to share it.</StCopy>
    <div data-print-hide><PrintDocumentButton /></div>
  </>;
}
