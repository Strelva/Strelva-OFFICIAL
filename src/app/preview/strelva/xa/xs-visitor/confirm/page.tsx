import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { XsVisitorFrame } from "@/experience/workspace/preview/XsVisitorFrame";
import { BookingConfirmation } from "@/experience/bookings/BookingConfirmation";
import { confirmState, PREVIEW_NOW, previewBrand, previewBusiness } from "@/experience/workspace/preview/xs-visitor-fixture";

export const dynamic = "force-dynamic";
export const metadata = { title: "Confirm booking preview", robots: { index: false, follow: false } };

/**
 * /booking-confirm/[token] as the real BookingConfirmation renders it once the
 * confirmation read returns its tenant (brand and phone). The live page has no
 * tenant yet (read_public_booking_confirmation, a migration waiting on
 * Jacob's yes), so today it renders as &brand=none.
 * ?state=held|confirming|requested|confirmed|cancelled|failed|rate&brand=none|hertel
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string; mode?: string; brand?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state, mode, brand } = await searchParams;
  const view = confirmState(state ?? "held", brand);
  const biz = previewBusiness(brand);
  const resolved = brand !== "none";
  return <XsVisitorFrame mode={mode}><BookingConfirmation now={PREVIEW_NOW} identity={view.identity} error={view.error} brand={previewBrand(brand)} phone={resolved ? biz.phone : null} business={resolved ? biz.name : null} actionUrl={`/preview/strelva/xa/xs-visitor/act?screen=confirm${brand ? `&brand=${brand}` : ""}${mode ? `&mode=${mode}` : ""}`} statusUrl={`?state=requested${brand ? `&brand=${brand}` : ""}`} service={biz.service} /></XsVisitorFrame>;
}
