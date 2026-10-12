import { isTenantId } from "@/lib/scaffold-contracts";
import { nativeServices, requireAgentBookings } from "@/platform/bookings/native";
import { bookingJson, bookingOptions, bookingError } from "../../_shared";
export const OPTIONS = bookingOptions;
export async function GET(_request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  if (!isTenantId(tenant)) return bookingJson({ error: "Invalid tenant." }, 400);
  try { await requireAgentBookings(); return bookingJson(await nativeServices(tenant)); } catch (error) { return bookingError(error); }
}
