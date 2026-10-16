"use client";
import { XaButton, XaTextLink } from "@/components/ui/strelva/Xa";

/** Print the page. `link` is the quiet text form, for a payer's page where nothing else is a button. */
export function PrintDocumentButton({ link = false }: { link?: boolean }) {
  if (link) return <XaTextLink onClick={() => window.print()}>Print or save as PDF</XaTextLink>;
  return (
    <XaButton size="sm" onClick={() => window.print()}>
      Print or save as PDF
    </XaButton>
  );
}
