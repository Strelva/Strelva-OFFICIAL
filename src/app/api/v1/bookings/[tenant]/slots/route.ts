import { isTenantId } from "@/lib/scaffold-contracts";
import { limitPublicBookingRead } from "@/platform/bookings/public-read";
import { nativeSlots, requireAgentBookings } from "@/platform/bookings/native";
import { bookingJson, bookingOptions, bookingError } from "../../_shared";
export const OPTIONS = bookingOptions;
export async function GET(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  if (!isTenantId(tenant)) return bookingJson({ error: "Invalid tenant." }, 400);
  try {
    await requireAgentBookings();
    await limitPublicBookingRead(request, tenant);
    const q = new URL(request.url).searchParams;
    return bookingJson(await nativeSlots(tenant, q.get("service") ?? "", q.get("from") ?? "", q.get("to") ?? ""));
  } catch (error) { return bookingError(error); }
}
