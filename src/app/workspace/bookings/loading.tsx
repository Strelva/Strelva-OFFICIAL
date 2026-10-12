import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import { WorkspaceBookingsLoading } from "@/experience/bookings/WorkspaceBookingsLoading";

export default function BookingsLoading() {
  return <StrelvaShell title="" businessContext="Business workspace"><WorkspaceBookingsLoading /></StrelvaShell>;
}
