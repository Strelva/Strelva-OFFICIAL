import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { XsVisitorFrame } from "@/experience/workspace/preview/XsVisitorFrame";
import { InquiryBookingOffer } from "@/experience/bookings/InquiryBookingOffer";
import { offerState, PREVIEW_NOW, previewBrand } from "@/experience/workspace/preview/xs-visitor-fixture";

export const dynamic = "force-dynamic";
export const metadata = { title: "Booking offer preview", robots: { index: false, follow: false } };

/** /book-inquiry/[token] as the real InquiryBookingOffer renders it. ?state=choose|empty|error|gone|unavailable|held|requested|confirmed|expired|unknown */
export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string; mode?: string; brand?: string; error?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state, mode, brand, error } = await searchParams;
  const view = offerState(state ?? "choose");
  return <XsVisitorFrame mode={mode}><InquiryBookingOffer now={PREVIEW_NOW} offer={view.offer} receipt={view.receipt} error={error === "pick" ? "pick" : view.error} unavailable={view.unavailable} brand={previewBrand(brand)} actionUrl={`/preview/strelva/xa/xs-visitor/act?screen=offer${brand ? `&brand=${brand}` : ""}`} /></XsVisitorFrame>;
}
