import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { OwnerMoneyPreview } from "@/experience/workspace/preview/OwnerMoneyPreview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Invoices · Local interface preview", robots: { index: false, follow: false } };

/** Fixture-only until a business invoice read and exact sending contract exist. */
export default async function InvoicePreviewPage({ searchParams }: { searchParams: Promise<{ state?: string; mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state, mode } = await searchParams;
  return <OwnerMoneyPreview surface="invoices" state={state} mode={mode} />;
}
