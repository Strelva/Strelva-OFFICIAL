import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { ManageBooking } from "@/experience/bookings/ManageBooking";
import type { ManageBookingState, ManagedBookingView } from "@/platform/bookings/manage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Strelva · Manage booking preview", robots: { index: false, follow: false } };

/** A fictional booking with a fictional law firm. */
const BOOKING: ManagedBookingView = {
  siteName: "The Mooney Firm", title: "Consultation", day: "Thursday, November 5", time: "10:00 AM", timeZoneLabel: "Eastern Time", status: "confirmed",
};
const DAYS = [
  { day: "Thursday, November 5", slots: [{ id: "a", time: "9:00 AM" }, { id: "b", time: "11:00 AM" }, { id: "c", time: "11:30 AM" }, { id: "d", time: "2:00 PM" }] },
  { day: "Friday, November 6", slots: [{ id: "e", time: "9:00 AM" }, { id: "f", time: "9:30 AM" }] },
  { day: "Monday, November 9", slots: [{ id: "g", time: "1:00 PM" }, { id: "h", time: "3:30 PM" }] },
];

export default async function ManageBookingPreviewPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state: name } = await searchParams;
  const ready: ManageBookingState = { kind: "ready", booking: BOOKING, days: DAYS, slotsUnavailable: false, changesClosed: false };
  const state: ManageBookingState = name === "not_found" ? { kind: "not_found" }
    : name === "error" ? { kind: "error" }
    : name === "ended" ? { kind: "ended", booking: BOOKING }
    : name === "cancelled" ? { ...ready, booking: { ...BOOKING, status: "cancelled" }, days: [], notice: "cancelled" }
    : name === "rescheduled" ? { ...ready, booking: { ...BOOKING, day: "Friday, November 6", time: "9:00 AM" }, notice: "rescheduled" }
    : name === "taken" ? { ...ready, error: "That time can't be booked now. Pick another time, or reply to your booking email." }
    : name === "paused" ? { ...ready, days: [], changesClosed: true }
    : name === "unavailable" ? { ...ready, days: [], slotsUnavailable: true }
    : name === "empty" ? { ...ready, days: [] }
    : name === "pending" ? { ...ready, booking: { ...BOOKING, status: "pending" } }
    : ready;
  return <ManageBooking state={state} actionUrl="/preview/strelva/booking-manage" />;
}
