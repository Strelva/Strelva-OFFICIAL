import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InquiryBookingOffer } from "@/experience/bookings/InquiryBookingOffer";
import { bookingInquiryOffersEnabled, readInquiryBookingOffer } from "@/platform/bookings/inquiry-offers";
import { readVisitorPresentationTime, readVisitorInquiryReceipt } from "@/products/scheduling/server";
import { readVisitorBrand } from "@/products/websites";
import { readVisitorBusinessPhone } from "@/platform/bookings/visitor-phone";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Choose a booking time", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function Page({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string; pick?: string }> }) {
  if (!bookingInquiryOffersEnabled()) notFound();
  const { token } = await params, query = await searchParams;
  const { offer, unavailable } = await readInquiryBookingOffer(token)
    .then(offer => ({ offer, unavailable: false }))
    .catch(() => ({ offer: null, unavailable: true }));
  const receipt = offer?.booked ? await readVisitorInquiryReceipt(token).catch(() => null) : null;
  const [brand, phone] = await Promise.all([readVisitorBrand(offer?.tenantId), readVisitorBusinessPhone(offer?.tenantId)]);
  const error = query.error === "pick" ? "pick" : !!query.error;
  return <InquiryBookingOffer now={await readVisitorPresentationTime()} offer={offer} receipt={receipt} brand={brand} phone={phone} pick={typeof query.pick === "string" ? query.pick : null} actionUrl={`/book-inquiry/${encodeURIComponent(token)}/action`} error={error} unavailable={unavailable}/>;
}
