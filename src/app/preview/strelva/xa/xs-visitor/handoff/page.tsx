import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { XsVisitorFrame } from "@/experience/workspace/preview/XsVisitorFrame";
import { InquiryBookingChoice } from "@/experience/bookings/InquiryBookingChoice";
import { e4Choice } from "@/experience/workspace/preview/xa7-outside-fixture";
import { PREVIEW_NOW } from "@/experience/workspace/preview/xs-visitor-fixture";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inquiry booking preview", robots: { index: false, follow: false } };

/** /inquiry-booking/[token] as the real InquiryBookingChoice renders it (xa7's E4 fixture). ?state=choose|empty|error|expired-link|rate|held|requested|confirmed */
export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string; mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state = "held", mode } = await searchParams;
  return <XsVisitorFrame mode={mode}><InquiryBookingChoice now={PREVIEW_NOW} businessName="Harbor Dental" choice={e4Choice(state)} unavailable={state === "error"} error={state === "rate" ? "rate" : undefined} actionUrl="#" /></XsVisitorFrame>;
}
