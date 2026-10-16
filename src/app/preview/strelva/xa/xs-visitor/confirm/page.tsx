import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { XsVisitorFrame } from "@/experience/workspace/preview/XsVisitorFrame";
import { BookingConfirmation } from "@/experience/bookings/BookingConfirmation";
import { confirmState, previewBrand } from "@/experience/workspace/preview/xs-visitor-fixture";

export const dynamic = "force-dynamic";
export const metadata = { title: "Confirm booking preview", robots: { index: false, follow: false } };

/** /booking-confirm/[token] as the real BookingConfirmation renders it. ?state=held|confirming|requested|confirmed|cancelled|failed|rate */
export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string; mode?: string; brand?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state, mode, brand } = await searchParams;
  const view = confirmState(state ?? "held");
  return <XsVisitorFrame mode={mode}><BookingConfirmation identity={view.identity} error={view.error} brand={previewBrand(brand)} actionUrl={`/preview/strelva/xa/xs-visitor/act?screen=confirm${brand ? `&brand=${brand}` : ""}`} statusUrl="?state=requested" service="New-patient exam with Dr. Lin" /></XsVisitorFrame>;
}
