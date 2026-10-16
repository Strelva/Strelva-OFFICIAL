import { readVisitorConfirmation } from "@/products/scheduling/server";
import type { Metadata } from "next";
import { BookingConfirmation } from "@/experience/bookings/BookingConfirmation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Confirm your booking request", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** Opening an email link is read-only, including automated mail scanners. */
export default async function BookingConfirmationPage({ params, searchParams }: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const identity = await readVisitorConfirmation(token).catch(() => null);
  const path = `/booking-confirm/${encodeURIComponent(token)}`;
  return <BookingConfirmation identity={identity} error={typeof query.error === "string" ? query.error : null} actionUrl={`${path}/action`} statusUrl={path} />;
}
