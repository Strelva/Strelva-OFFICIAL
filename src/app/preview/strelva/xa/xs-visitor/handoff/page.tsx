import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { XsVisitorFrame } from "@/experience/workspace/preview/XsVisitorFrame";
import { InquiryBookingChoice } from "@/experience/bookings/InquiryBookingChoice";
import { e4Choice } from "@/experience/workspace/preview/xa7-outside-fixture";
import { PREVIEW_NOW, previewBrand, previewBusiness } from "@/experience/workspace/preview/xs-visitor-fixture";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inquiry booking preview", robots: { index: false, follow: false } };

/** /inquiry-booking/[token] as the real InquiryBookingChoice renders it (xa7's E4 fixture). ?state=choose|empty|error|expired-link|rate|held|requested|confirmed&slot=N (the posted pick)&pick=N (tapped in the email)&brand=none|hertel */
export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string; mode?: string; brand?: string; error?: string; slot?: string; pick?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state = "held", mode, brand, error, slot, pick } = await searchParams;
  const biz = previewBusiness(brand);
  return <XsVisitorFrame mode={mode}><InquiryBookingChoice now={PREVIEW_NOW} businessName={biz.name} businessPhone={biz.phone} choice={e4Choice(state, slot, biz)} unavailable={state === "error"} error={state === "rate" ? "rate" : error === "pick" ? "pick" : undefined} brand={previewBrand(brand)} pick={pick ?? null} actionUrl={`/preview/strelva/xa/xs-visitor/act?screen=handoff${brand ? `&brand=${brand}` : ""}${mode ? `&mode=${mode}` : ""}`} /></XsVisitorFrame>;
}
