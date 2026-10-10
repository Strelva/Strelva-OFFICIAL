import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InquiryBookingOffer } from "@/experience/bookings/InquiryBookingOffer";
import { bookingInquiryOffersEnabled, readInquiryBookingOffer } from "@/platform/bookings/inquiry-offers";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Choose a booking time", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function Page({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  if (!bookingInquiryOffersEnabled()) notFound();
  const { token } = await params, query = await searchParams;
  const offer = await readInquiryBookingOffer(token).catch(() => null);
  return <InquiryBookingOffer offer={offer} actionUrl={`/book-inquiry/${encodeURIComponent(token)}/action`} error={!!query.error}/>;
}
