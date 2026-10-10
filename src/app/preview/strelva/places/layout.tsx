import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";

/** Visible evidence scope for the existing gated, fictional place fixtures. */
export default function PlacesPreviewLayout({ children }: { children: ReactNode }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  return <div className="min-h-dvh bg-canvas text-warm-black">
    <p role="note" className="border-b border-gray-border px-4 py-3 text-sm text-gray-muted sm:px-6">Local rehearsal · fictional bakery records. This page is not proof of email delivery or saved inquiry decisions.</p>
    {children}
  </div>;
}
