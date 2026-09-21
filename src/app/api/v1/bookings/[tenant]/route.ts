import { isTenantId } from "@/lib/scaffold-contracts";
import { publicBookingRangeSchema } from "@/products/scheduling/server";
import { bookingError, bookingJson, bookingOptions, bookingService, stringValue } from "../_shared";

export const dynamic = "force-dynamic";

export async function OPTIONS(): Promise<Response> {
  return bookingOptions();
}

export async function GET(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  if (!isTenantId(tenant)) return bookingJson({ error: "Invalid tenant." }, 400);
  const url = new URL(request.url);
  const capabilityId = stringValue(url.searchParams.get("capabilityId"), 200);
  if (!capabilityId) return bookingJson({ error: "A booking capability is required." }, 400);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if ((from && !to) || (!from && to)) return bookingJson({ error: "The booking range must include from and to." }, 400);
  const range = from && to ? publicBookingRangeSchema.safeParse({ from, to }) : undefined;
  if (range && !range.success) return bookingJson({ error: "The booking date range is invalid." }, 400);
  try {
    return bookingJson(await bookingService().read({ tenantId: tenant, capabilityId, ...(range ? { range: range.data } : {}) }));
  } catch (error) {
    return bookingError(error);
  }
}
