import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { XsVisitorFrame } from "@/experience/workspace/preview/XsVisitorFrame";
import { ManageBooking } from "@/experience/bookings/ManageBooking";
import { manageState } from "@/experience/workspace/preview/xs-visitor-fixture";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your booking preview", robots: { index: false, follow: false } };

/** /b/[token] as the real ManageBooking renders it. Forms post nowhere. ?state=see MANAGE_STATES&mode=dark */
export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string; mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state, mode } = await searchParams;
  return <XsVisitorFrame mode={mode}><ManageBooking state={manageState(state ?? "confirmed")} actionUrl="#" /></XsVisitorFrame>;
}
