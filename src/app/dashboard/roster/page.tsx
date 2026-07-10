import { requireDashboardFeature } from "@/lib/dashboard-feature-guard";
import { getBookings } from "@/lib/storage";
import { RosterPanel } from "@/components/dashboard/RosterPanel";

export default async function RosterPage() {
  const { tenant } = await requireDashboardFeature("roster");

  // Today's appointments only. The date is the tenant's calendar day; bookings
  // store their date as a local YYYY-MM-DD, so a same-day range is the match.
  const today = new Date().toISOString().slice(0, 10);
  const bookings = await getBookings(tenant, { from: today, to: today }).catch(() => []);

  return <RosterPanel bookings={bookings} today={today} />;
}
