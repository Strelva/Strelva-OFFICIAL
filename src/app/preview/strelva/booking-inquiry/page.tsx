import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { InquiryBookingOffer } from "@/experience/bookings/InquiryBookingOffer";
import type { InquiryBookingOffer as Offer } from "@/platform/bookings/inquiry-offers";
export const dynamic = "force-dynamic";
export const metadata = { title: "Booking suggestion preview", robots: { index: false, follow: false } };
const offer: Offer = {
  businessName: "The Mooney Firm", id: "fictional", serviceId: "consultation", serviceName: "Consultation", timeZone: "America/New_York",
  expiresAt: "2026-11-08T15:00:00Z", url: "#", token: "fictional", booked: false,
  slots: ["2026-11-05T15:00:00Z", "2026-11-06T15:00:00Z", "2026-11-09T15:00:00Z"].map(start => ({ start, end: new Date(Date.parse(start) + 1800000).toISOString() })),
};
export default async function Page({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state } = await searchParams;
  return <InquiryBookingOffer now={Date.parse("2026-11-05T14:45:00Z")} offer={state === "expired" ? null : { ...offer, booked: state === "booked" || state === "waiting" || state === "confirmed" }} receipt={state === "booked" || state === "waiting" || state === "confirmed" ? { status: state === "confirmed" ? "confirmed" : state === "waiting" ? "requested" : "held", start: offer.slots[0]!.start, timeZone: offer.timeZone, confirmUntil: "2026-11-05T14:55:00Z" } : null} error={state === "taken"} actionUrl="/preview/strelva/booking-inquiry" />;
}
