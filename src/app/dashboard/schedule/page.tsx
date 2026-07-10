import { requireDashboardFeature } from "@/lib/dashboard-feature-guard";
import { getBookings, getBookingConfig, getDateOverrides } from "@/lib/storage";
import { DEFAULT_BOOKING_CONFIG } from "@/lib/booking";
import { SchedulePanel } from "@/components/dashboard/SchedulePanel";

export default async function SchedulePage() {
  const { tenant } = await requireDashboardFeature("schedule");

  // Fail-soft: a transient backend blip degrades to an honest empty/default
  // surface rather than the full error boundary. The owner's own save actions
  // go through the validated API routes.
  const [bookings, config, overrides] = await Promise.all([
    getBookings(tenant).catch(() => []),
    getBookingConfig(tenant).catch(() => DEFAULT_BOOKING_CONFIG),
    getDateOverrides(tenant).catch(() => []),
  ]);

  return (
    <SchedulePanel bookings={bookings} config={config} overrides={overrides} />
  );
}
