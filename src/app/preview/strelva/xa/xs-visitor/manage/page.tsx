import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { XsVisitorFrame } from "@/experience/workspace/preview/XsVisitorFrame";
import { ManageBooking } from "@/experience/bookings/ManageBooking";
import { manageState, previewBrand } from "@/experience/workspace/preview/xs-visitor-fixture";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your booking preview", robots: { index: false, follow: false } };

/** /b/[token] as the real ManageBooking renders it. Forms post to the preview's own act route, which only moves to the next state. ?state=see MANAGE_STATES&mode=dark&brand=none */
export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string; mode?: string; brand?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state, mode, brand } = await searchParams;
  return <XsVisitorFrame mode={mode}><ManageBooking state={manageState(state ?? "confirmed")} brand={previewBrand(brand)} actionUrl={`/preview/strelva/xa/xs-visitor/act?screen=manage${brand ? `&brand=${brand}` : ""}`} /></XsVisitorFrame>;
}
