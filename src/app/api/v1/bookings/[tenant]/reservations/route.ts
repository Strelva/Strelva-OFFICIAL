import { isTenantId } from "@/lib/scaffold-contracts";
import { isRateLimitedAsync, rateLimitKey } from "@/lib/rate-limit";
import { publicBookingVisitorSchema } from "@/products/scheduling/server";
import { bookingError, bookingJson, bookingOptions, bookingService, bodyObject, stringValue } from "../../_shared";

function integerValue(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : undefined;
}

export async function OPTIONS(): Promise<Response> {
  return bookingOptions();
}

export async function POST(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  if (!isTenantId(tenant)) return bookingJson({ error: "Invalid tenant." }, 400);
  try {
    if (await isRateLimitedAsync(rateLimitKey(request, `v1-bookings:${tenant}`), 20)) return bookingJson({ error: "Too many booking requests." }, 429);
  } catch {
    // A limiter outage must not make a truthful booking boundary look like an
    // availability outage; the durable idempotency key still protects retries.
  }
  const body = await bodyObject(request);
  if (!body) return bookingJson({ error: "Invalid request body." }, 400);
  const capabilityId = stringValue(body.capabilityId, 200);
  const capabilityVersion = integerValue(body.capabilityVersion);
  const slotId = stringValue(body.slotId, 256);
  const visitor = publicBookingVisitorSchema.safeParse(body.visitor);
  const requestId = body.requestId === undefined ? undefined : stringValue(body.requestId, 96);
  if (!capabilityId || !capabilityVersion || !slotId || !visitor.success || (body.requestId !== undefined && !requestId)) {
    return bookingJson({ error: "Enter the booking capability, time, and visitor details." }, 400);
  }
  try {
    return bookingJson(await bookingService().reserve({
      tenantId: tenant,
      capabilityId,
      capabilityVersion,
      slotId,
      visitor: visitor.data,
      ...(requestId ? { requestId } : {}),
    }), 201);
  } catch (error) {
    return bookingError(error);
  }
}
