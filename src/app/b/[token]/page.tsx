import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ManageBooking } from "@/experience/bookings/ManageBooking";
import { bookingManagePageEnabled } from "@/platform/bookings/flags";
import { loadManageState, type ManageBookingState } from "@/platform/bookings/manage";
import { manageDeps } from "@/server/bookings/manage-server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your booking", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** The customer's manage link (bookings spec, "Manage link"). Off unless STRELVA_BOOKING_MANAGE_PAGE=1. GET never changes anything. */
export default async function ManageBookingPage({ params, searchParams }: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!bookingManagePageEnabled()) notFound();
  const { token } = await params;
  const query = await searchParams;
  let state: ManageBookingState;
  try {
    state = await loadManageState(token, {
      done: typeof query.done === "string" ? query.done : null,
      error: typeof query.error === "string" ? query.error : null,
    }, manageDeps());
  } catch (error) {
    console.error("[bookings] manage page read failed", error instanceof Error ? error.message : String(error));
    state = { kind: "error" };
  }
  return <ManageBooking state={state} actionUrl={`/b/${encodeURIComponent(token)}/action`} />;
}
