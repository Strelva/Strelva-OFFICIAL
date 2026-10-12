import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InquiryBookingOffer } from "@/experience/bookings/InquiryBookingOffer";
import { bookingInquiryOffersEnabled, readInquiryBookingOffer } from "@/platform/bookings/inquiry-offers";
import { readVisitorPresentationTime, readVisitorInquiryReceipt } from "@/products/scheduling/public-visitor-receipt";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Choose a booking time", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function Page({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  if (!bookingInquiryOffersEnabled()) notFound();
  const { token } = await params, query = await searchParams;
  const { offer, unavailable } = await readInquiryBookingOffer(token)
    .then(offer => ({ offer, unavailable: false }))
    .catch(() => ({ offer: null, unavailable: true }));
  const receipt = offer?.booked ? await readVisitorInquiryReceipt(token).catch(() => null) : null;
  return <InquiryBookingOffer now={await readVisitorPresentationTime()} offer={offer} receipt={receipt} actionUrl={`/book-inquiry/${encodeURIComponent(token)}/action`} error={!!query.error} unavailable={unavailable}/>;
}
