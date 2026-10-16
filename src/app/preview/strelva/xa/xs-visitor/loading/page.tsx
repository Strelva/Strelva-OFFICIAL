import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { XsVisitorFrame } from "@/experience/workspace/preview/XsVisitorFrame";
import { VisitorBookingLoading } from "@/experience/bookings/VisitorBookingLoading";

export const dynamic = "force-dynamic";
export const metadata = { title: "Booking loading preview", robots: { index: false, follow: false } };

/** loading.tsx for /booking-confirm, /book-inquiry and /inquiry-booking. */
export default async function Page({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { mode } = await searchParams;
  return <XsVisitorFrame mode={mode}><VisitorBookingLoading /></XsVisitorFrame>;
}
