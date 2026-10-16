"use client";
import { XaButton } from "@/components/ui/strelva/Xa";

export function PrintDocumentButton() {
  return <XaButton size="sm" onClick={() => window.print()}>Print or save as PDF</XaButton>;
}
