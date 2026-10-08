import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InquiryBookingChoice } from "@/experience/bookings/InquiryBookingChoice";
import { inquiryBookingHandoffEnabled, loadInquiryBookingChoice } from "@/products/inquiries";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Choose an appointment time", robots: { index: false, follow: false }, referrer: "no-referrer" };
/** GET is a read: mail scanners cannot request a booking. */
export default async function InquiryBookingPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!inquiryBookingHandoffEnabled()) notFound();
  const { token } = await params;
  const query = await searchParams;
  let choice: Awaited<ReturnType<typeof loadInquiryBookingChoice>> = null;
  let unavailable = false;
  try { choice = await loadInquiryBookingChoice(token); } catch { unavailable = true; }
  return <InquiryBookingChoice choice={choice} unavailable={unavailable} actionUrl={`/inquiry-booking/${encodeURIComponent(token)}/action`} error={typeof query.error === "string" ? query.error : undefined} />;
}
