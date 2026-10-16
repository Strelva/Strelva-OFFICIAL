import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { XsVisitorFrame } from "@/experience/workspace/preview/XsVisitorFrame";
import { ManageBooking } from "@/experience/bookings/ManageBooking";
import { manageState, previewBrand, previewBusiness } from "@/experience/workspace/preview/xs-visitor-fixture";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your booking preview", robots: { index: false, follow: false } };

/**
 * /b/[token] as the real ManageBooking renders it. Forms post to the preview's
 * own act route, which only moves to the next state and carries the picked
 * slot. not-found and load-error stay unnamed, as live: a token that reads no
 * booking names no business.
 * ?state=see MANAGE_STATES&slot=s4&mode=dark&brand=none|hertel
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string; mode?: string; brand?: string; slot?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state, mode, brand, slot } = await searchParams;
  const view = manageState(state ?? "confirmed", { slot, brand });
  const known = view.kind === "ready" || view.kind === "ended";
  return <XsVisitorFrame mode={mode}><ManageBooking state={view} brand={known ? previewBrand(brand) : null} phone={known ? previewBusiness(brand).phone : null} actionUrl={`/preview/strelva/xa/xs-visitor/act?screen=manage${brand ? `&brand=${brand}` : ""}${mode ? `&mode=${mode}` : ""}`} /></XsVisitorFrame>;
}
