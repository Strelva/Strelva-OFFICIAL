import { requireDashboardFeature } from "@/lib/dashboard-feature-guard";
import { getBookings, getBookingConfig } from "@/lib/storage";
import { DEFAULT_BOOKING_CONFIG, zonedTodayIso } from "@/lib/booking";
import { RosterPanel } from "@/components/dashboard/RosterPanel";
import { InspectPreviewBanner } from "@/components/dashboard/InspectPreviewBanner";

export default async function RosterPage() {
  const { tenant, preview } = await requireDashboardFeature("roster");

  // Today's appointments only, anchored to the tenant's LOCAL calendar day.
  // Bookings store their date as the tenant-local YYYY-MM-DD, so "today" must
  // be computed in the tenant's timezone (config.timezone) — a UTC date would
  // roll to tomorrow after ~8pm ET and hide tonight's roster.
  const config = await getBookingConfig(tenant).catch(() => DEFAULT_BOOKING_CONFIG);
  const today = zonedTodayIso(config.timezone);
  const bookings = await getBookings(tenant, { from: today, to: today }).catch(() => []);

  return (
    <>
      {preview && <InspectPreviewBanner tenant={tenant} featureId="roster" />}
      <RosterPanel bookings={bookings} today={today} />
    </>
  );
}
