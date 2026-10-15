"use client";
import { StTextButton } from "@/components/ui/strelva/Kit";

export function PrintDocumentButton() {
  return <StTextButton onClick={() => window.print()}>Print or save as PDF</StTextButton>;
}
