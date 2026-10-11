import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { InquiryBookingReceiptFixture } from "@/experience/bookings/InquiryBookingReceiptFixture";
import { InquiryBookingChoice } from "@/experience/bookings/InquiryBookingChoice";
import { parseStoreBooking } from "@/platform/bookings/store";
import type { InquiryBookingOffer } from "@/products/inquiries";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Inquiry booking fixture", robots: { index: false, follow: false }, referrer: "no-referrer" };
const id = "e0000000-0000-4000-8000-000000000001";
const serviceId = "e0000000-0000-4000-8000-000000000002";
const offer: InquiryBookingOffer = { serviceId, services: [{ id: serviceId, name: "Initial consultation", durationMinutes: 30 }], serviceName: "Initial consultation", timeZone: "America/New_York", chooseUrl: "/preview/strelva/inquiry-booking", expiresAt: "2026-11-05T14:00:00Z", slots: [
  { start: "2026-11-06T14:00:00Z", end: "2026-11-06T14:30:00Z", label: "Fri, Nov 6, 9:00 AM EST", chooseUrl: "/preview/strelva/inquiry-booking?slot=0" },
  { start: "2026-11-06T14:30:00Z", end: "2026-11-06T15:00:00Z", label: "Fri, Nov 6, 9:30 AM EST", chooseUrl: "/preview/strelva/inquiry-booking?slot=1" },
  { start: "2026-11-06T15:00:00Z", end: "2026-11-06T15:30:00Z", label: "Fri, Nov 6, 10:00 AM EST", chooseUrl: "/preview/strelva/inquiry-booking?slot=2" },
] };
/** Fictional isolated fixtures. Never resolve grants, sign production links or send. */
export default async function InquiryBookingPreview({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const query = await searchParams;
  const status = query.state;
  if (status === "receipt") return <InquiryBookingReceiptFixture />;
  const index = typeof query.slot === "string" && /^[0-2]$/.test(query.slot) ? Number(query.slot) : 0;
  const slot = offer.slots[index]!;
  const booking = status === "requested" || status === "confirmed" ? parseStoreBooking({ id, start: slot.start, end: slot.end, status, origin: "inquiry", serviceName: offer.serviceName, inquiryId: "lead_fixture", timeZone: offer.timeZone, customer: { name: "Dana Reed", email: "dana@example.test" } }) : null;
  return <InquiryBookingChoice choice={status === "expired" || status === "error" ? null : { offer, booking }} unavailable={status === "error"} actionUrl="/preview/strelva/inquiry-booking/action" error={status === "conflict" ? "unavailable" : status === "rate" ? "rate" : undefined} />;
}
