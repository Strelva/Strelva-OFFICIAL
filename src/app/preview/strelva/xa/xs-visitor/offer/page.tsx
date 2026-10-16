import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { XsVisitorFrame } from "@/experience/workspace/preview/XsVisitorFrame";
import { InquiryBookingOffer } from "@/experience/bookings/InquiryBookingOffer";
import { offerState, PREVIEW_NOW, previewBrand, previewBusiness } from "@/experience/workspace/preview/xs-visitor-fixture";

export const dynamic = "force-dynamic";
export const metadata = { title: "Booking offer preview", robots: { index: false, follow: false } };

/**
 * /book-inquiry/[token] as the real InquiryBookingOffer renders it. The bad-news
 * states (gone, unavailable) show the business as the page renders it when the
 * link still resolves to it; &brand=none shows the unresolved page.
 * ?state=choose|empty|error|gone|unavailable|held|requested|confirmed|expired|unknown&start=ISO (the posted pick)&pick=ISO (tapped in the email)&brand=none|hertel
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string; mode?: string; brand?: string; error?: string; start?: string; pick?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state, mode, brand, error, start, pick } = await searchParams;
  const view = offerState(state ?? "choose", { start, brand });
  const biz = previewBusiness(brand);
  const resolved = brand !== "none";
  return <XsVisitorFrame mode={mode}><InquiryBookingOffer now={PREVIEW_NOW} offer={view.offer} receipt={view.receipt} error={error === "pick" ? "pick" : view.error} unavailable={view.unavailable} brand={previewBrand(brand)} phone={resolved ? biz.phone : null} business={resolved ? biz.name : null} pick={pick ?? null} actionUrl={`/preview/strelva/xa/xs-visitor/act?screen=offer${brand ? `&brand=${brand}` : ""}${mode ? `&mode=${mode}` : ""}`} /></XsVisitorFrame>;
}
